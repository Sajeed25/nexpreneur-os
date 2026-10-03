import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { notify } from "@/lib/notify";

// Internal payment helpers. NOT server actions: nothing here may be callable from the browser.
const { invoices, payments } = schema;

export type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
export type Method = "cash" | "upi" | "bank" | "card" | "razorpay";

export const rzpKeys = () => {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  return id && secret && id !== "placeholder" && secret !== "placeholder" ? { id, secret } : null;
};
export const rzpAuth = (k: { id: string; secret: string }) => "Basic " + Buffer.from(`${k.id}:${k.secret}`).toString("base64");

export const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Applies a captured payment to an invoice and refreshes its paid total/status. Run inside a transaction with the invoice row locked. */
export async function applyPayment(
  tx: Tx, s: { org: string; uid: string | null }, inv: typeof invoices.$inferSelect, amountPaise: number, method: Method,
  extra: { orderId?: string; paymentId?: string; note?: string },
) {
  const paid = inv.paidPaise + amountPaise;
  await tx.insert(payments).values({
    organizationId: s.org, invoiceId: inv.id, userId: inv.userId, amountPaise, method, status: "captured",
    razorpayOrderId: extra.orderId ?? null, razorpayPaymentId: extra.paymentId ?? null, note: extra.note ?? null, recordedBy: s.uid,
  });
  await tx.update(invoices).set({ paidPaise: paid, status: paid >= inv.totalPaise ? "paid" : "partial" }).where(eq(invoices.id, inv.id));
  await notify(tx, { org: s.org, userId: inv.userId, kind: "payment", title: `Payment received: ${inv.number}`, body: `₹${(amountPaise / 100).toLocaleString("en-IN")} via ${method}`, link: `/invoices/${inv.id}` });
}

/** Shared by the browser callback and the webhook. Idempotent on the Razorpay payment id. */
export async function recordRazorpay(orderId: string, paymentId: string, actor: string | null, org?: string): Promise<{ ok: boolean; error?: string }> {
  const k = rzpKeys();
  if (!k) return { ok: false, error: "Not configured" };
  const headers = { Authorization: rzpAuth(k) };
  // Ask Razorpay what was really paid, instead of trusting whoever called us.
  const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers });
  if (!r.ok) return { ok: false, error: "Couldn't verify the payment with Razorpay." };
  const pay = (await r.json()) as { status: string; amount: number; order_id: string };
  if (pay.order_id !== orderId || (pay.status !== "captured" && pay.status !== "authorized")) return { ok: false, error: "Payment not completed." };
  const o = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, { headers });
  const invoiceId = o.ok ? ((await o.json()) as { notes?: { invoiceId?: string } }).notes?.invoiceId : undefined;
  if (!invoiceId) return { ok: false, error: "Order has no invoice." };
  try {
    await db().transaction(async (tx) => {
      const [dup] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.razorpayPaymentId, paymentId));
      if (dup) return; // already recorded (callback + webhook race)
      const [inv] = await tx.select().from(invoices).where(org ? and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org)) : eq(invoices.id, invoiceId)).for("update");
      if (!inv) throw new Error("Invoice not found");
      await applyPayment(tx, { org: inv.organizationId, uid: actor }, inv, pay.amount, "razorpay", { orderId, paymentId });
    });
    return { ok: true };
  } catch (e) {
    console.error("recordRazorpay failed", e);
    return { ok: false, error: "Couldn't record the payment." };
  }
}
