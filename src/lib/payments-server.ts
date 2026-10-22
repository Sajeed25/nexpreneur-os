import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { notify } from "@/lib/notify";

// Internal payment helpers. NOT server actions: nothing here may be callable from the browser.
const { invoices, payments, autopayMandates } = schema;

export type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
export type Method = "cash" | "upi" | "bank" | "card" | "razorpay" | "tds" | "credit_note";

export const rzpKeys = () => {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  return id && secret && id !== "placeholder" && secret !== "placeholder" ? { id, secret } : null;
};
export const rzpAuth = (k: { id: string; secret: string }) => "Basic " + Buffer.from(`${k.id}:${k.secret}`).toString("base64");
/** Razorpay's API root. Overridable so the integration can be tested against a stand-in server. */
export const rzpBase = () => process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1";

export const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Calls Razorpay with our keys. Throws a short message (never the keys) on failure. */
export async function rzp<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const k = rzpKeys();
  if (!k) throw new Error("Razorpay isn't configured");
  const r = await fetch(`${rzpBase()}${path}`, {
    method: init?.method ?? "GET", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: rzpAuth(k), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok) {
    const msg = ((await r.json().catch(() => null)) as { error?: { description?: string } } | null)?.error?.description;
    throw new Error(msg ? `Razorpay: ${msg.slice(0, 160)}` : `Razorpay returned ${r.status}`);
  }
  return (await r.json()) as T;
}

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
  const cash = method !== "tds" && method !== "credit_note";
  await notify(tx, {
    org: s.org, userId: inv.userId, kind: "payment",
    title: cash ? `Payment received: ${inv.number}` : `${method === "tds" ? "TDS credited" : "Credit note applied"}: ${inv.number}`,
    body: `₹${(amountPaise / 100).toLocaleString("en-IN")}${cash ? ` via ${method}` : ""}`, link: `/invoices/${inv.id}`,
  });
  if (paid >= inv.totalPaise) await onInvoicePaid(tx, inv);
}

/** Things that happen once an invoice is fully paid. Kept in one place so every payment route (cash, online, link, autopay) does them. */
async function onInvoicePaid(tx: Tx, inv: typeof invoices.$inferSelect) {
  const { completeDepositItem } = await import("@/lib/onboarding");
  await completeDepositItem(tx, inv);
}

/**
 * Records money Razorpay has captured against an invoice. Idempotent on the Razorpay payment id, so the browser callback,
 * the webhook and a payment link can all report the same payment safely.
 */
export async function settleRazorpay(
  p: { invoiceId: string; paymentId: string; orderId: string | null; amountPaise: number; actor: string | null; org?: string; note?: string },
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  try {
    let duplicate = false;
    await db().transaction(async (tx) => {
      const [dup] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.razorpayPaymentId, p.paymentId));
      if (dup) { duplicate = true; return; } // already recorded (callback + webhook race)
      const [inv] = await tx.select().from(invoices).where(p.org ? and(eq(invoices.id, p.invoiceId), eq(invoices.organizationId, p.org)) : eq(invoices.id, p.invoiceId)).for("update");
      if (!inv) throw new Error("Invoice not found");
      await applyPayment(tx, { org: inv.organizationId, uid: p.actor }, inv, p.amountPaise, "razorpay", { orderId: p.orderId ?? undefined, paymentId: p.paymentId, note: p.note });
      const over = inv.paidPaise + p.amountPaise - inv.totalPaise;
      if (over > 0) {
        // The money is real, so it is recorded; but the invoice was already (nearly) settled, so something needs a human.
        await tx.insert(schema.auditLogs).values({ organizationId: inv.organizationId, actorId: p.actor, action: `payment.overpaid:${over}`, entity: "invoice", entityId: inv.id });
      }
    });
    return { ok: true, duplicate };
  } catch (e) {
    console.error("settleRazorpay failed", e);
    return { ok: false, error: e instanceof Error && e.message === "Invoice not found" ? e.message : "Couldn't record the payment." };
  }
}

type RzpPayment = { status: string; amount: number; order_id: string | null };

/** Shared by the browser callback and the webhook. Idempotent on the Razorpay payment id. */
export async function recordRazorpay(orderId: string, paymentId: string, actor: string | null, org?: string): Promise<{ ok: boolean; error?: string }> {
  if (!rzpKeys()) return { ok: false, error: "Not configured" };
  try {
    // Ask Razorpay what was really paid, instead of trusting whoever called us.
    const pay = await rzp<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (pay.order_id !== orderId || (pay.status !== "captured" && pay.status !== "authorized")) return { ok: false, error: "Payment not completed." };
    const order = await rzp<{ notes?: { invoiceId?: string } }>(`/orders/${encodeURIComponent(orderId)}`);
    const invoiceId = order.notes?.invoiceId;
    if (!invoiceId) return { ok: false, error: "Order has no invoice." };
    return await settleRazorpay({ invoiceId, paymentId, orderId, amountPaise: pay.amount, actor, org });
  } catch (e) {
    console.error("recordRazorpay failed", e);
    return { ok: false, error: "Couldn't verify the payment with Razorpay." };
  }
}

/** A Razorpay Payment Link was paid: verify with Razorpay, then record against the invoice the link was made for. */
export async function recordPaymentLink(linkId: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!rzpKeys()) return { ok: false, error: "Not configured" };
  try {
    const link = await rzp<{ id: string; status: string; reference_id?: string; order_id?: string }>(`/payment_links/${encodeURIComponent(linkId)}`);
    if (link.status !== "paid" || !link.reference_id) return { ok: false, error: "Link not paid." };
    const pay = await rzp<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (pay.status !== "captured" && pay.status !== "authorized") return { ok: false, error: "Payment not completed." };
    if (link.order_id && pay.order_id && link.order_id !== pay.order_id) return { ok: false, error: "Payment doesn't belong to this link." };
    // reference_id is the invoice id we set when creating the link.
    const [inv] = await db().select({ id: invoices.id }).from(invoices).where(eq(invoices.id, link.reference_id));
    if (!inv) return { ok: false, error: "Invoice not found" };
    return await settleRazorpay({ invoiceId: inv.id, paymentId, orderId: pay.order_id, amountPaise: pay.amount, actor: null, note: "Payment link" });
  } catch (e) {
    console.error("recordPaymentLink failed", e);
    return { ok: false, error: "Couldn't verify the payment with Razorpay." };
  }
}

/**
 * A UPI-autopay / card-mandate charge went through. The charge pays the member's oldest open invoice (their renewal).
 * If there is none, we raise it for a human instead of guessing.
 */
export async function recordSubscriptionCharge(subscriptionId: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!rzpKeys()) return { ok: false, error: "Not configured" };
  try {
    const [m] = await db().select().from(autopayMandates).where(eq(autopayMandates.rzpSubscriptionId, subscriptionId));
    if (!m) return { ok: false, error: "Unknown subscription" };
    const pay = await rzp<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (pay.status !== "captured" && pay.status !== "authorized") return { ok: false, error: "Payment not completed." };
    const [open] = await db().select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.organizationId, m.organizationId), eq(invoices.userId, m.userId), inArray(invoices.status, ["unpaid", "partial"]))).orderBy(asc(invoices.dueDate)).limit(1);
    if (!open) {
      await db().insert(schema.auditLogs).values({ organizationId: m.organizationId, actorId: null, action: "autopay.no_open_invoice", entity: "user", entityId: m.userId });
      const finance = await db().select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.organizationId, m.organizationId), inArray(schema.users.role, ["owner", "super_admin", "finance"])));
      for (const f of finance) await notify(db(), { org: m.organizationId, userId: f.id, kind: "payment", title: "Autopay charged with no open invoice", body: `₹${(pay.amount / 100).toLocaleString("en-IN")} (Razorpay ${paymentId}). Reconcile or refund.`, link: "/payments" });
      return { ok: false, error: "No open invoice" };
    }
    return await settleRazorpay({ invoiceId: open.id, paymentId, orderId: pay.order_id, amountPaise: pay.amount, actor: null, note: "Autopay" });
  } catch (e) {
    console.error("recordSubscriptionCharge failed", e);
    return { ok: false, error: "Couldn't verify the payment with Razorpay." };
  }
}
