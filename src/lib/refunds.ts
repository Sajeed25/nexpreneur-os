import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MANAGER_ROLES, statusFor } from "@/lib/billing";
import { rzp, rzpKeys } from "@/lib/payments-server";
import { notify } from "@/lib/notify";

const { payments, refunds, invoices, auditLogs, organizations, users } = schema;

/** A message that is safe to show to the person who asked. */
export class RefundError extends Error {}

/**
 * Pays back part or all of a payment, in one transaction. Online payments are refunded through Razorpay first;
 * offline ones are recorded for the team to hand back. `approvedBy` is set when a second person signed it off.
 */
export async function performRefund(s: { org: string; uid: string }, paymentId: string, amt: number, reason: string, approvedBy?: string | null) {
  await db().transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.organizationId, s.org))).for("update");
    if (!pay || pay.status === "failed") throw new RefundError("Payment not found");
    if (pay.method === "tds" || pay.method === "credit_note") throw new RefundError("That entry isn't a cash payment, so it can't be refunded.");
    if (amt > pay.amountPaise - pay.refundedPaise) throw new RefundError("That is more than what's left to refund on this payment");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, pay.invoiceId)).for("update");
    if (!inv) throw new RefundError("Invoice not found");

    let rzpRefundId: string | null = null;
    if (pay.method === "razorpay") {
      if (!rzpKeys() || !pay.razorpayPaymentId) throw new RefundError("Online refunds aren't set up. Check the Razorpay keys.");
      try {
        const r = await rzp<{ id?: string }>(`/payments/${encodeURIComponent(pay.razorpayPaymentId)}/refund`, { method: "POST", body: { amount: amt, notes: { invoice: inv.number, reason: reason.slice(0, 200) } } });
        rzpRefundId = r.id ?? null;
      } catch (e) {
        console.error("razorpay refund failed", e instanceof Error ? e.message : e);
        throw new RefundError("Razorpay couldn't process the refund. Try again, or refund from the Razorpay dashboard.");
      }
    }

    const refunded = pay.refundedPaise + amt;
    await tx.insert(refunds).values({ organizationId: s.org, paymentId: pay.id, invoiceId: inv.id, userId: pay.userId, amountPaise: amt, reason: reason || null, razorpayRefundId: rzpRefundId, createdBy: s.uid });
    await tx.update(payments).set({ refundedPaise: refunded, status: refunded >= pay.amountPaise ? "refunded" : pay.status }).where(eq(payments.id, pay.id));
    const paid = Math.max(0, inv.paidPaise - amt);
    await tx.update(invoices).set({ paidPaise: paid, status: inv.status === "void" ? "void" : statusFor(inv.totalPaise, paid) }).where(eq(invoices.id, inv.id));
    await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `payment.refund:${rzpRefundId ?? pay.method}${approvedBy ? ":approved" : ""}`, entity: "invoice", entityId: inv.id });
    await notify(tx, { org: s.org, userId: pay.userId, kind: "refund", title: `Refund issued: ${inv.number}`, body: `₹${(amt / 100).toLocaleString("en-IN")}${reason ? ` · ${reason}` : ""}`, link: `/invoices/${inv.id}` });
  });
}

export const approvalThreshold = async (org: string) => {
  const [o] = await db().select({ t: organizations.refundApprovalPaise }).from(organizations).where(eq(organizations.id, org));
  return o?.t ?? 0;
};

/** True when this refund needs a second person's sign-off. A threshold of 0 turns the rule off. */
export const needsApproval = (amountPaise: number, thresholdPaise: number) => thresholdPaise > 0 && amountPaise >= thresholdPaise;

/** Who may approve: managers other than the requester. If there is nobody else, the requester may (and it is logged). */
export async function approversFor(org: string, requesterId: string) {
  const mgr = await db().select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
    .where(and(eq(users.organizationId, org), inArray(users.role, [...MANAGER_ROLES]), isNull(users.deletedAt)));
  return mgr.filter((u) => u.id !== requesterId);
}
