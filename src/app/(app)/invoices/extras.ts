"use server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance, isManager, toPaise } from "@/lib/billing";
import { emailInvoice } from "@/lib/invoice-mail";
import { notify } from "@/lib/notify";
import { RefundError, approvalThreshold, approversFor, needsApproval, performRefund } from "@/lib/refunds";
import { appUrl, sendMail, smtpConfigured } from "@/lib/mailer";
import { refundApprovalEmail } from "@/lib/emails-growth";

const { coupons, payments, invoices, memberships, auditLogs, refundRequests } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Connect the database and sign in with a real account.";
const FORBIDDEN = "You don't have permission to do that.";
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

async function ctx(section: "memberships" | "invoices" | "payments") {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, section) ? s : null;
}

// ---------- Coupons ----------
export type CouponDTO = { id: string; code: string; kind: "percent" | "fixed"; value: number; maxUses: number | null; usedCount: number; validUntil: string | null; active: boolean };

export async function listCoupons(): Promise<Result<CouponDTO[]>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO);
  if (!isFinance(s.role)) return { ok: true, data: [] };
  const rows = await db().select().from(coupons).where(eq(coupons.organizationId, s.org)).orderBy(desc(coupons.createdAt)).limit(200);
  return { ok: true, data: rows.map((c) => ({ id: c.id, code: c.code, kind: c.kind, value: c.value, maxUses: c.maxUses, usedCount: c.usedCount, validUntil: c.validUntil, active: c.active })) };
}

const couponIn = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "Use 3-40 letters, numbers, - or _"),
  kind: z.enum(["percent", "fixed"]), value: z.number().positive().max(10_000_000),
  maxUses: z.number().int().min(1).max(1_000_000).optional(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export async function createCoupon(input: z.infer<typeof couponIn>): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  const p = couponIn.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  if (p.data.kind === "percent" && (p.data.value > 100 || !Number.isInteger(p.data.value))) return fail("A percentage must be a whole number from 1 to 100");
  try {
    await db().insert(coupons).values({
      organizationId: s.org, code: p.data.code, kind: p.data.kind, value: p.data.kind === "percent" ? p.data.value : toPaise(p.data.value),
      maxUses: p.data.maxUses ?? null, validUntil: p.data.validUntil ?? null,
    });
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    return fail(code === "ER_DUP_ENTRY" ? "That code already exists." : "Couldn't create the coupon.");
  }
  return { ok: true, data: null };
}

export async function setCouponActive(id: string, active: boolean): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  await db().update(coupons).set({ active }).where(and(eq(coupons.id, id), eq(coupons.organizationId, s.org)));
  return { ok: true, data: null };
}

// ---------- Email an invoice ----------
export async function sendInvoiceEmail(id: string): Promise<Result<null>> {
  const s = await ctx("invoices");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const r = await emailInvoice(s.org, id);
  if (!r.ok) return fail(r.error ?? "Couldn't send the email.");
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.email", entity: "invoice", entityId: id });
  return { ok: true, data: null };
}

// ---------- Refunds ----------
const refundIn = z.object({ paymentId: z.string().uuid(), amount: z.number().positive().max(10_000_000), reason: z.string().trim().max(255) });

export type RefundOutcome = { status: "done" | "pending"; approvers: number };

/**
 * Refunds part or all of a payment. Refunds at or above the organisation's limit don't happen straight away: they go to
 * a second person (a manager other than the requester) to approve. Smaller ones are done immediately.
 */
export async function refundPayment(input: z.infer<typeof refundIn>): Promise<Result<RefundOutcome>> {
  const s = await ctx("payments");
  if (!s) return fail(NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = refundIn.safeParse(input);
  if (!p.success) return fail("Check the refund details");
  const amt = toPaise(p.data.amount);
  try {
    const threshold = await approvalThreshold(s.org);
    if (needsApproval(amt, threshold)) {
      const [pay] = await db().select().from(payments).where(and(eq(payments.id, p.data.paymentId), eq(payments.organizationId, s.org)));
      if (!pay || pay.status === "failed") return fail("Payment not found");
      if (pay.method === "tds" || pay.method === "credit_note") return fail("That entry isn't a cash payment, so it can't be refunded.");
      if (amt > pay.amountPaise - pay.refundedPaise) return fail("That is more than what's left to refund on this payment");
      const dup = await db().select({ id: refundRequests.id }).from(refundRequests).where(and(eq(refundRequests.paymentId, pay.id), eq(refundRequests.status, "pending"))).limit(1);
      if (dup.length) return fail("A refund for this payment is already waiting for approval.");
      const [inv] = await db().select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, pay.invoiceId));
      const [reqId] = [crypto.randomUUID()];
      await db().insert(refundRequests).values({ id: reqId, organizationId: s.org, paymentId: pay.id, invoiceId: pay.invoiceId, amountPaise: amt, reason: p.data.reason || null, requestedBy: s.uid });
      await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `refund.requested:${amt}`, entity: "invoice", entityId: pay.invoiceId });
      const approvers = await approversFor(s.org, s.uid);
      const who = approvers.length ? approvers : (await db().select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role }).from(schema.users).where(and(eq(schema.users.id, s.uid))));
      const base = appUrl();
      for (const a of who) {
        await notify(db(), { org: s.org, userId: a.id, kind: "approval", title: `Refund approval needed: ₹${(amt / 100).toLocaleString("en-IN")}`, body: `${s.name} asked to refund ${inv?.number ?? "an invoice"}${p.data.reason ? ` · ${p.data.reason}` : ""}`, link: "/payments" });
        if (approvers.length && smtpConfigured()) {
          try { const m = refundApprovalEmail({ approver: a.name, requester: s.name, invoice: inv?.number ?? "", amountPaise: amt, reason: p.data.reason || null, link: base ? `${base}/payments` : null }); await sendMail(a.email, m.subject, m.text, m.html); } catch (e) { console.error("refund approval email failed", e); }
        }
      }
      return { ok: true, data: { status: "pending", approvers: approvers.length } };
    }
    await performRefund(s, p.data.paymentId, amt, p.data.reason);
    return { ok: true, data: { status: "done", approvers: 0 } };
  } catch (e) {
    if (e instanceof RefundError) return fail(e.message);
    const m = e instanceof Error ? e.message : "";
    return fail(m && !/^(Failed query|Error:)/.test(m) ? m : "Couldn't process the refund");
  }
}

export type RefundRequestDTO = {
  id: string; invoiceId: string; invoiceNumber: string; customer: string; amountPaise: number; reason: string | null;
  requestedBy: string; requestedById: string; createdAt: string; canDecide: boolean; selfOnly: boolean;
};

/** Pending refund requests, for managers. */
export async function listRefundRequests(): Promise<Result<RefundRequestDTO[]>> {
  const s = await ctx("payments");
  if (!s) return fail(NO);
  if (!isManager(s.role) && s.role !== "finance") return { ok: true, data: [] };
  const rows = await db().select({ r: refundRequests, i: schema.invoices, u: schema.users }).from(refundRequests)
    .innerJoin(schema.invoices, eq(schema.invoices.id, refundRequests.invoiceId)).innerJoin(schema.users, eq(schema.users.id, schema.invoices.userId))
    .where(and(eq(refundRequests.organizationId, s.org), eq(refundRequests.status, "pending"))).orderBy(desc(refundRequests.createdAt)).limit(50);
  const names = new Map((await db().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.organizationId, s.org))).map((u) => [u.id, u.name]));
  const mgrs = isManager(s.role) ? await approversFor(s.org, s.uid) : [];
  return { ok: true, data: rows.map(({ r, i, u }) => ({
    id: r.id, invoiceId: i.id, invoiceNumber: i.number, customer: u.name, amountPaise: r.amountPaise, reason: r.reason,
    requestedBy: names.get(r.requestedBy) ?? "Someone", requestedById: r.requestedBy, createdAt: r.createdAt.toISOString(),
    // A request is decided by a manager who didn't make it; if there is no other manager, the requester may decide their own.
    canDecide: isManager(s.role) && (r.requestedBy !== s.uid || mgrs.length === 0), selfOnly: r.requestedBy === s.uid && mgrs.length === 0,
  })) };
}

export async function decideRefundRequest(id: string, approve: boolean, note: string): Promise<Result<null>> {
  const s = await ctx("payments");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  try {
    const [r] = await db().select().from(refundRequests).where(and(eq(refundRequests.id, id), eq(refundRequests.organizationId, s.org)));
    if (!r || r.status !== "pending") return fail("This request has already been handled.");
    if (r.requestedBy === s.uid && (await approversFor(s.org, s.uid)).length > 0) return fail("Someone else needs to approve a refund you asked for.");
    // Claim the decision first so two approvers can't both act on it.
    const claim = await db().update(refundRequests).set({ status: approve ? "approved" : "rejected", decidedBy: s.uid, decidedAt: new Date(), decisionNote: note.slice(0, 255) || null })
      .where(and(eq(refundRequests.id, id), eq(refundRequests.status, "pending")));
    if (!(claim[0] as { affectedRows?: number }).affectedRows) return fail("This request has already been handled.");
    if (approve) {
      try {
        await performRefund({ org: s.org, uid: r.requestedBy }, r.paymentId, r.amountPaise, r.reason ?? "", s.uid);
      } catch (e) {
        await db().update(refundRequests).set({ status: "pending", decidedBy: null, decidedAt: null, decisionNote: null }).where(eq(refundRequests.id, id)); // put it back so it can be retried
        throw e;
      }
    }
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `refund.${approve ? "approved" : "rejected"}`, entity: "invoice", entityId: r.invoiceId });
    await notify(db(), { org: s.org, userId: r.requestedBy, kind: "approval", title: `Refund ${approve ? "approved" : "declined"}`, body: `₹${(r.amountPaise / 100).toLocaleString("en-IN")}${note ? ` · ${note}` : ""}`, link: `/invoices/${r.invoiceId}` });
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof RefundError) return fail(e.message);
    console.error("decideRefundRequest failed", e);
    return fail("Couldn't complete that. Please try again.");
  }
}

export async function cancelRefundRequest(id: string): Promise<Result<null>> {
  const s = await ctx("payments");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  const r = await db().update(refundRequests).set({ status: "cancelled" })
    .where(and(eq(refundRequests.id, id), eq(refundRequests.organizationId, s.org), eq(refundRequests.status, "pending"), eq(refundRequests.requestedBy, s.uid)));
  if (!(r[0] as { affectedRows?: number }).affectedRows) return fail("That request can't be withdrawn.");
  return { ok: true, data: null };
}

// ---------- Pause / cancel a membership ----------
export async function setMembershipStatus(id: string, status: "active" | "paused" | "cancelled"): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s || !z.string().uuid().safeParse(id).success || !["active", "paused", "cancelled"].includes(status)) return fail(s ? "Invalid request" : NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const [m] = await db().select().from(memberships).where(and(eq(memberships.id, id), eq(memberships.organizationId, s.org)));
  if (!m) return fail("Membership not found");
  if (m.status === "cancelled" || m.status === "expired") return fail("This membership has ended. Start a new one instead.");
  await db().update(memberships).set({ status, cancelledAt: status === "cancelled" ? new Date() : null }).where(eq(memberships.id, id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `membership.${status}`, entity: "membership", entityId: id });
  return { ok: true, data: null };
}

// ---------- Small helpers for forms ----------
export async function listLocationOptions(): Promise<Result<{ id: string; city: string; name: string }[]>> {
  const s = await getSession();
  if (!s || s.demo || !hasDb()) return fail(NO);
  const rows = await db().select({ id: schema.locations.id, city: schema.locations.city, name: schema.locations.name }).from(schema.locations)
    .where(and(eq(schema.locations.organizationId, s.org), isNull(schema.locations.deletedAt))).orderBy(schema.locations.createdAt);
  return { ok: true, data: rows.map((r) => ({ id: r.id, city: r.city ?? "", name: r.name })) };
}

// ---------- Plan pricing management ----------
export type PlanAdminDTO = { id: string; name: string; pricePaise: number; billingCycle: string; benefits: string[]; archived: boolean; activeMembers: number; bookingHours: number; dayPasses: number };

export async function listPlansAdmin(): Promise<Result<PlanAdminDTO[]>> {
  const s = await ctx("memberships");
  if (!s) return fail(NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  const plans = await db().select().from(schema.membershipPlans).where(eq(schema.membershipPlans.organizationId, s.org)).orderBy(schema.membershipPlans.pricePaise);
  const counts = await db().select({ planId: memberships.planId, n: sql<number>`count(*)` }).from(memberships).where(and(eq(memberships.organizationId, s.org), eq(memberships.status, "active"))).groupBy(memberships.planId);
  return { ok: true, data: plans.map((p) => ({ id: p.id, name: p.name, pricePaise: p.pricePaise, billingCycle: p.billingCycle, benefits: p.benefits ?? [], archived: !!p.deletedAt, activeMembers: Number(counts.find((c) => c.planId === p.id)?.n ?? 0), bookingHours: p.bookingCredits ?? 0, dayPasses: p.includedDays ?? 0 })) };
}

const planEdit = z.object({
  name: z.string().trim().min(2).max(120), price: z.number().min(0).max(10_000_000),
  cycle: z.enum(["monthly", "quarterly", "yearly"]), benefits: z.array(z.string().trim().min(1).max(120)).max(12),
  bookingHours: z.number().int().min(0).max(1000).optional(), dayPasses: z.number().int().min(0).max(400).optional(),
});
/** New price applies to future invoices and renewals. Invoices already issued keep the price they were issued at. */
export async function updatePlan(id: string, input: z.infer<typeof planEdit>): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  const p = planEdit.safeParse(input);
  if (!p.success) return fail("Check the plan details");
  const r = await db().update(schema.membershipPlans).set({ name: p.data.name, pricePaise: toPaise(p.data.price), billingCycle: p.data.cycle, benefits: p.data.benefits, bookingCredits: p.data.bookingHours || null, includedDays: p.data.dayPasses || null })
    .where(and(eq(schema.membershipPlans.id, id), eq(schema.membershipPlans.organizationId, s.org)));
  if (!(r[0] as { affectedRows?: number }).affectedRows) return fail("Plan not found");
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `plan.update:${toPaise(p.data.price)}`, entity: "plan", entityId: id });
  return { ok: true, data: null };
}

/** Archived plans can't be assigned to new members. People already on one keep it and keep renewing. */
export async function setPlanArchived(id: string, archived: boolean): Promise<Result<null>> {
  const s = await ctx("memberships");
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!isManager(s.role)) return fail(FORBIDDEN);
  await db().update(schema.membershipPlans).set({ deletedAt: archived ? new Date() : null }).where(and(eq(schema.membershipPlans.id, id), eq(schema.membershipPlans.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: archived ? "plan.archive" : "plan.restore", entity: "plan", entityId: id });
  return { ok: true, data: null };
}
