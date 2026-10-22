import { createHmac } from "node:crypto";
import { hasDb } from "@/lib/db/config";
import { recordPaymentLink, recordRazorpay, recordSubscriptionCharge, safeEq } from "@/lib/payments-server";

export const dynamic = "force-dynamic";

type Entity<T> = { entity?: T };
type Evt = {
  event?: string;
  payload?: {
    payment?: Entity<{ id?: string; order_id?: string; invoice_id?: string }>;
    payment_link?: Entity<{ id?: string }>;
    subscription?: Entity<{ id?: string; status?: string }>;
  };
};

/**
 * Razorpay -> us. Set the dashboard webhook URL to https://<your-domain>/api/razorpay/webhook with the events
 * payment.captured, payment_link.paid, subscription.authenticated, subscription.activated, subscription.charged,
 * subscription.halted, subscription.cancelled, subscription.completed, subscription.paused and subscription.resumed.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || secret === "placeholder" || !hasDb()) return new Response("Not configured", { status: 503 });

  const raw = await req.text(); // the signature is over the exact raw body
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEq(expected, sig)) return new Response("Bad signature", { status: 400 });

  let evt: Evt;
  try { evt = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }
  const pay = evt.payload?.payment?.entity;
  const sub = evt.payload?.subscription?.entity;
  const link = evt.payload?.payment_link?.entity;

  try {
    if (evt.event === "payment_link.paid" && link?.id && pay?.id) {
      const r = await recordPaymentLink(link.id, pay.id);
      if (!r.ok) console.error("webhook payment link failed:", r.error);
    } else if (evt.event === "subscription.charged" && sub?.id && pay?.id) {
      const r = await recordSubscriptionCharge(sub.id, pay.id);
      if (!r.ok && r.error !== "No open invoice") console.error("webhook autopay charge failed:", r.error);
    } else if (evt.event?.startsWith("subscription.") && sub?.id) {
      const { onSubscriptionEvent } = await import("@/lib/autopay");
      await onSubscriptionEvent(evt.event, sub.id, sub.status);
    } else if (evt.event === "payment.captured" && pay?.id && pay.order_id) {
      const r = await recordRazorpay(pay.order_id, pay.id, null);
      // Payments made through a payment link or autopay have no invoice on their order; those are recorded by their own events.
      if (!r.ok && r.error !== "Order has no invoice.") console.error("webhook record failed:", r.error);
    }
  } catch (e) {
    console.error("webhook handler failed", e);
    return new Response("Error", { status: 500 }); // let Razorpay retry; every handler is idempotent
  }
  return new Response("ok");
}
