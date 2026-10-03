"use server";
import { createHmac } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession, type Session } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CYCLE_MONTHS, addMonths, gst, invoiceNumber, isFinance, isManager, toPaise, SELLER_STATE, type Line } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { CouponError, issueInvoice } from "@/lib/invoicing";
import { emailInvoice } from "@/lib/invoice-mail";
import { smtpConfigured } from "@/lib/mailer";
import { applyPayment, rzpAuth, rzpKeys, recordRazorpay, safeEq, type Tx } from "@/lib/payments-server";

const { users, membershipPlans, memberships, invoices, invoiceItems, payments, organizations, auditLogs, companies, refunds, locations } = schema;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO_ACCESS = "Connect the database and sign in with a real account to use billing.";
const FORBIDDEN = "You don't have permission to do that.";

async function ctx(section: "memberships" | "invoices" | "payments"): Promise<Session | null> {
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !can(s.role, section)) return null;
  return s;
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ---------- Plans & memberships ----------
export type PlanDTO = { id: string; name: string; pricePaise: number; billingCycle: string; benefits: string[] };
export type MemberOpt = { id: string; name: string; email: string };
export type MembershipDTO = { id: string; userId: string; who: string; plan: string; startDate: string; renewalDate: string; status: string };

export async function listPlans(): Promise<Result<PlanDTO[]>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO_ACCESS);
  const rows = await db().select().from(membershipPlans)
    .where(and(eq(membershipPlans.organizationId, s.org), isNull(membershipPlans.deletedAt))).orderBy(membershipPlans.pricePaise);
  return { ok: true, data: rows.map((p) => ({ id: p.id, name: p.name, pricePaise: p.pricePaise, billingCycle: p.billingCycle, benefits: p.benefits ?? [] })) };
}

const planIn = z.object({
  name: z.string().trim().min(2).max(120), price: z.number().min(0).max(10_000_000),
  cycle: z.enum(["monthly", "quarterly", "yearly"]), benefits: z.array(z.string().trim().min(1).max(120)).max(12),
});
export async function createPlan(input: z.infer<typeof planIn>): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO_ACCESS);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  const p = planIn.safeParse(input);
  if (!p.success) return fail("Check the plan details");
  await db().insert(membershipPlans).values({ organizationId: s.org, name: p.data.name, pricePaise: toPaise(p.data.price), billingCycle: p.data.cycle, benefits: p.data.benefits });
  return { ok: true, data: null };
}

export async function listMemberOptions(): Promise<Result<MemberOpt[]>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO_ACCESS);
  if (!isFinance(s.role)) return { ok: true, data: [] };
  const rows = await db().select({ id: users.id, name: users.name, email: users.email }).from(users)
    .where(and(eq(users.organizationId, s.org), isNull(users.deletedAt))).orderBy(users.name).limit(500);
  return { ok: true, data: rows };
}

export async function listMemberships(): Promise<Result<MembershipDTO[]>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO_ACCESS);
  const mine = isFinance(s.role) ? undefined : eq(memberships.userId, s.uid);
  const rows = await db().select({ m: memberships, p: membershipPlans, u: users }).from(memberships)
    .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, s.org), mine)).orderBy(memberships.renewalDate).limit(500);
  return { ok: true, data: rows.map(({ m, p, u }) => ({ id: m.id, userId: u.id, who: u.name, plan: p.name, startDate: m.startDate, renewalDate: m.renewalDate, status: m.status })) };
}

const assignIn = z.object({
  userId: z.string().uuid(), planId: z.string().uuid(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationId: z.string().uuid().optional(), couponCode: z.string().trim().max(40).optional(), email: z.boolean().optional(),
});
/** Starts a membership and issues its first invoice (plan price + 18% GST), in one transaction. */
export async function assignMembership(input: z.infer<typeof assignIn>): Promise<Result<{ invoiceId: string }>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO_ACCESS);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = assignIn.safeParse(input);
  if (!p.success) return fail("Pick a member, a plan and a start date");
  try {
    const invoiceId = await db().transaction(async (tx) => {
      const [plan] = await tx.select().from(membershipPlans).where(and(eq(membershipPlans.id, p.data.planId), eq(membershipPlans.organizationId, s.org), isNull(membershipPlans.deletedAt)));
      const [member] = await tx.select().from(users).where(and(eq(users.id, p.data.userId), eq(users.organizationId, s.org)));
      if (!plan || !member) throw new Error("NOT_FOUND");
      const renewal = addMonths(p.data.startDate, CYCLE_MONTHS[plan.billingCycle] ?? 1);
      const locationId = await resolveLocation(tx, s.org, p.data.locationId);
      await tx.insert(memberships).values({ organizationId: s.org, userId: member.id, planId: plan.id, startDate: p.data.startDate, renewalDate: renewal, locationId });
      return issueInvoice(tx, s, member.id, [{ description: `${plan.name} membership (${p.data.startDate} to ${renewal})`, qty: 1, unitPaise: plan.pricePaise, taxPct: 18 }], p.data.startDate, false, null, 7, { couponCode: p.data.couponCode || null, locationId });
    });
    if (p.data.email) await emailInvoice(s.org, invoiceId);
    return { ok: true, data: { invoiceId } };
  } catch (e) {
    if (e instanceof CouponError) return fail(e.message);
    return fail((e as Error).message === "NOT_FOUND" ? "Member or plan not found" : "Couldn't assign the membership");
  }
}

/** The chosen location if it belongs to this organisation, otherwise the organisation's first location. */
async function resolveLocation(tx: Tx, org: string, wanted?: string) {
  const rows = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, org), isNull(locations.deletedAt))).orderBy(locations.createdAt);
  return rows.find((r) => r.id === wanted)?.id ?? rows[0]?.id ?? null;
}

// ---------- Invoices ----------

export type InvoiceRow = {
  id: string; number: string; who: string; issueDate: string; dueDate: string;
  totalPaise: number; paidPaise: number; status: string;
};
export async function listInvoices(): Promise<Result<InvoiceRow[]>> {
  const s = await ctx("invoices");
  if (!s) return fail(NO_ACCESS);
  const mine = isFinance(s.role) ? undefined : eq(invoices.userId, s.uid);
  const rows = await db().select({ i: invoices, u: users }).from(invoices).innerJoin(users, eq(users.id, invoices.userId))
    .where(and(eq(invoices.organizationId, s.org), mine)).orderBy(desc(invoices.issueDate), desc(invoices.number)).limit(500);
  return { ok: true, data: rows.map(({ i, u }) => ({ id: i.id, number: i.number, who: u.name, issueDate: i.issueDate, dueDate: i.dueDate, totalPaise: i.totalPaise, paidPaise: i.paidPaise, status: i.status })) };
}

const lineIn = z.object({ description: z.string().trim().min(1).max(255), qty: z.number().int().min(1).max(10_000), price: z.number().min(0).max(10_000_000), taxPct: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]) });
const invoiceIn = z.object({
  userId: z.string().uuid(), lines: z.array(lineIn).min(1).max(30), interstate: z.boolean(),
  buyerGstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 characters").optional().or(z.literal("")),
  dueInDays: z.number().int().min(0).max(120),
  couponCode: z.string().trim().max(40).optional(), locationId: z.string().uuid().optional(), companyId: z.string().uuid().optional(), email: z.boolean().optional(),
});
export async function createInvoice(input: z.infer<typeof invoiceIn>): Promise<Result<{ id: string }>> {
  const s = await ctx("invoices");
  if (!s) return fail(NO_ACCESS);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = invoiceIn.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the invoice details");
  try {
    const id = await db().transaction(async (tx) => {
      const [m] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, p.data.userId), eq(users.organizationId, s.org)));
      if (!m) throw new Error("NOT_FOUND");
      const lines: Line[] = p.data.lines.map((l) => ({ description: l.description, qty: l.qty, unitPaise: toPaise(l.price), taxPct: l.taxPct }));
      let companyId: string | null = null, gstin = p.data.buyerGstin || null;
      if (p.data.companyId) {
        const [co] = await tx.select().from(companies).where(and(eq(companies.id, p.data.companyId), eq(companies.organizationId, s.org), isNull(companies.deletedAt)));
        if (!co) throw new Error("COMPANY");
        companyId = co.id; gstin = gstin ?? co.gstin;
      }
      const locationId = await resolveLocation(tx, s.org, p.data.locationId);
      return issueInvoice(tx, s, m.id, lines, todayIST(), p.data.interstate, gstin, p.data.dueInDays, { couponCode: p.data.couponCode || null, locationId, companyId });
    });
    if (p.data.email) await emailInvoice(s.org, id);
    return { ok: true, data: { id } };
  } catch (e) {
    if (e instanceof CouponError) return fail(e.message);
    const m = (e as Error).message;
    return fail(m === "NOT_FOUND" ? "Member not found" : m === "COMPANY" ? "Company not found" : "Couldn't create the invoice");
  }
}

export type InvoiceDetail = {
  invoice: typeof invoices.$inferSelect; customer: { name: string; email: string };
  items: (typeof invoiceItems.$inferSelect)[]; company: { name: string; gstin: string } | null; canEmail: boolean;
  payments: { id: string; amountPaise: number; refundedPaise: number; method: string; status: string; note: string | null; at: string }[];
  seller: { name: string; gstin: string };
};
export async function getInvoice(id: string): Promise<Result<InvoiceDetail>> {
  const s = await ctx("invoices");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invoice not found" : NO_ACCESS);
  const [row] = await db().select({ i: invoices, u: users }).from(invoices).innerJoin(users, eq(users.id, invoices.userId))
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, s.org)));
  if (!row || (!isFinance(s.role) && row.i.userId !== s.uid)) return fail("Invoice not found");
  const items = await db().select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  const pays = await db().select().from(payments).where(eq(payments.invoiceId, id)).orderBy(payments.createdAt);
  const [co] = row.i.companyId ? await db().select().from(companies).where(and(eq(companies.id, row.i.companyId), eq(companies.organizationId, s.org))) : [];
  return { ok: true, data: {
    invoice: row.i, customer: { name: row.u.name, email: row.u.email }, items, canEmail: smtpConfigured(),
    company: co ? { name: co.name, gstin: co.gstin ?? "" } : null,
    payments: pays.map((x) => ({ id: x.id, amountPaise: x.amountPaise, refundedPaise: x.refundedPaise, method: x.method, status: x.status, note: x.note, at: x.createdAt.toISOString() })),
    seller: { name: process.env.SELLER_NAME ?? "Nexpreneur", gstin: process.env.SELLER_GSTIN ?? "" },
  } };
}

// ---------- Payments ----------
const payIn = z.object({ invoiceId: z.string().uuid(), amount: z.number().positive().max(10_000_000), method: z.enum(["cash", "upi", "bank", "card"]), note: z.string().trim().max(255).optional() });
export async function recordPayment(input: z.infer<typeof payIn>): Promise<Result<null>> {
  const s = await ctx("payments");
  if (!s) return fail(NO_ACCESS);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = payIn.safeParse(input);
  if (!p.success) return fail("Check the payment details");
  try {
    await db().transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, p.data.invoiceId), eq(invoices.organizationId, s.org))).for("update");
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "void" || inv.status === "paid") throw new Error("This invoice can't take more payments");
      const amt = toPaise(p.data.amount);
      if (amt > inv.totalPaise - inv.paidPaise) throw new Error("Amount is more than the balance due");
      await applyPayment(tx, s, inv, amt, p.data.method, { note: p.data.note });
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "payment.record", entity: "invoice", entityId: inv.id });
    });
    return { ok: true, data: null };
  } catch (e) {
    return fail(e instanceof Error && !/^(Failed query|Error:)/.test(e.message) ? e.message : "Couldn't record the payment");
  }
}

export async function voidInvoice(id: string): Promise<Result<null>> {
  const s = await ctx("invoices");
  if (!s) return fail(NO_ACCESS);
  if (!isManager(s.role) && s.role !== "finance") return fail(FORBIDDEN);
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.organizationId, s.org)));
  if (!inv) return fail("Invoice not found");
  if (inv.paidPaise > 0) return fail("This invoice already has payments. Refund them before voiding.");
  await db().update(invoices).set({ status: "void" }).where(eq(invoices.id, id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.void", entity: "invoice", entityId: id });
  return { ok: true, data: null };
}

export type PaymentRow = { id: string; number: string; who: string; amountPaise: number; method: string; status: string; at: string };
export async function listPayments(): Promise<Result<PaymentRow[]>> {
  const s = await ctx("payments");
  if (!s) return fail(NO_ACCESS);
  const mine = isFinance(s.role) ? undefined : eq(payments.userId, s.uid);
  const rows = await db().select({ p: payments, i: invoices, u: users }).from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(users, eq(users.id, payments.userId))
    .where(and(eq(payments.organizationId, s.org), mine)).orderBy(desc(payments.createdAt)).limit(500);
  return { ok: true, data: rows.map(({ p, i, u }) => ({ id: p.id, number: i.number, who: u.name, amountPaise: p.amountPaise, method: p.method, status: p.status, at: p.createdAt.toISOString() })) };
}

// ---------- Razorpay (works only once RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set) ----------
export async function onlinePaymentsEnabled() { return !!rzpKeys(); }

/** Creates a Razorpay order for the invoice balance. The amount always comes from our database, never from the browser. */
export async function createRazorpayOrder(invoiceId: string): Promise<Result<{ orderId: string; amountPaise: number; keyId: string; number: string }>> {
  const s = await ctx("payments");
  const k = rzpKeys();
  if (!s || !z.string().uuid().safeParse(invoiceId).success) return fail(NO_ACCESS);
  if (!k) return fail("Online payments aren't set up yet. Please pay at reception.");
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, s.org)));
  if (!inv || (!isFinance(s.role) && inv.userId !== s.uid)) return fail("Invoice not found");
  const due = inv.totalPaise - inv.paidPaise;
  if (inv.status === "void" || due <= 0) return fail("Nothing to pay on this invoice");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: rzpAuth(k) },
    body: JSON.stringify({ amount: due, currency: "INR", receipt: inv.number, notes: { invoiceId: inv.id } }),
  });
  if (!res.ok) { console.error("razorpay order failed", res.status); return fail("Couldn't start the payment. Please try again."); }
  const o = (await res.json()) as { id: string };
  return { ok: true, data: { orderId: o.id, amountPaise: due, keyId: k.id, number: inv.number } };
}

/** Browser callback after checkout: verifies Razorpay's signature, then records the payment once. */
export async function confirmRazorpayPayment(input: { orderId: string; paymentId: string; signature: string }): Promise<Result<null>> {
  const s = await ctx("payments");
  const k = rzpKeys();
  if (!s || !k) return fail(NO_ACCESS);
  const expected = createHmac("sha256", k.secret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
  if (!safeEq(expected, input.signature)) return fail("Payment verification failed.");
  const r = await recordRazorpay(input.orderId, input.paymentId, s.uid, s.org);
  return r.ok ? { ok: true, data: null } : fail(r.error ?? "Couldn't record the payment.");
}

export async function outstandingTotal(): Promise<Result<number>> {
  const s = await ctx("invoices");
  if (!s) return fail(NO_ACCESS);
  const mine = isFinance(s.role) ? undefined : eq(invoices.userId, s.uid);
  const [r] = await db().select({ v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), inArray(invoices.status, ["unpaid", "partial"]), mine));
  return { ok: true, data: Number(r.v) };
}
