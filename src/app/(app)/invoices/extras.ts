"use server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance, isManager, statusFor, toPaise } from "@/lib/billing";
import { rzpAuth, rzpKeys } from "@/lib/payments-server";
import { emailInvoice } from "@/lib/invoice-mail";
import { notify } from "@/lib/notify";

const { coupons, payments, refunds, invoices, memberships, auditLogs } = schema;
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

/** Refunds part or all of a payment. Online payments are refunded through Razorpay first; offline ones are recorded for you to hand back. */
export async function refundPayment(input: z.infer<typeof refundIn>): Promise<Result<null>> {
  const s = await ctx("payments");
  if (!s) return fail(NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = refundIn.safeParse(input);
  if (!p.success) return fail("Check the refund details");
  const amt = toPaise(p.data.amount);
  try {
    await db().transaction(async (tx) => {
      const [pay] = await tx.select().from(payments).where(and(eq(payments.id, p.data.paymentId), eq(payments.organizationId, s.org))).for("update");
      if (!pay || pay.status === "failed") throw new Error("Payment not found");
      if (amt > pay.amountPaise - pay.refundedPaise) throw new Error("That is more than what's left to refund on this payment");
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, pay.invoiceId)).for("update");
      if (!inv) throw new Error("Invoice not found");

      let rzpRefundId: string | null = null;
      if (pay.method === "razorpay") {
        const k = rzpKeys();
        if (!k || !pay.razorpayPaymentId) throw new Error("Online refunds aren't set up. Check the Razorpay keys.");
        const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(pay.razorpayPaymentId)}/refund`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: rzpAuth(k) }, signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({ amount: amt, notes: { invoice: inv.number, reason: p.data.reason.slice(0, 200) } }),
        });
        if (!r.ok) { console.error("razorpay refund failed", r.status); throw new Error("Razorpay couldn't process the refund. Try again, or refund from the Razorpay dashboard."); }
        rzpRefundId = ((await r.json()) as { id?: string }).id ?? null;
      }

      const refunded = pay.refundedPaise + amt;
      await tx.insert(refunds).values({ organizationId: s.org, paymentId: pay.id, invoiceId: inv.id, userId: pay.userId, amountPaise: amt, reason: p.data.reason || null, razorpayRefundId: rzpRefundId, createdBy: s.uid });
      await tx.update(payments).set({ refundedPaise: refunded, status: refunded >= pay.amountPaise ? "refunded" : pay.status }).where(eq(payments.id, pay.id));
      const paid = Math.max(0, inv.paidPaise - amt);
      await tx.update(invoices).set({ paidPaise: paid, status: inv.status === "void" ? "void" : statusFor(inv.totalPaise, paid) }).where(eq(invoices.id, inv.id));
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `payment.refund:${rzpRefundId ?? pay.method}`, entity: "invoice", entityId: inv.id });
      await notify(tx, { org: s.org, userId: pay.userId, kind: "refund", title: `Refund issued: ${inv.number}`, body: `₹${(amt / 100).toLocaleString("en-IN")}${p.data.reason ? ` · ${p.data.reason}` : ""}`, link: `/invoices/${inv.id}` });
    });
    return { ok: true, data: null };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return fail(m && !/^(Failed query|Error:)/.test(m) ? m : "Couldn't process the refund");
  }
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
export async function listLocationOptions(): Promise<Result<{ id: string; city: string }[]>> {
  const s = await getSession();
  if (!s || s.demo || !hasDb()) return fail(NO);
  const rows = await db().select({ id: schema.locations.id, city: schema.locations.city }).from(schema.locations)
    .where(and(eq(schema.locations.organizationId, s.org), isNull(schema.locations.deletedAt))).orderBy(schema.locations.createdAt);
  return { ok: true, data: rows.map((r) => ({ id: r.id, city: r.city ?? "" })) };
}
