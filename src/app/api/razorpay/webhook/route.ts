import { createHmac } from "node:crypto";
import { hasDb } from "@/lib/db/config";
import { recordRazorpay, safeEq } from "@/lib/payments-server";

export const dynamic = "force-dynamic";

/** Razorpay -> us. Set the dashboard webhook URL to https://<your-domain>/api/razorpay/webhook with event payment.captured. */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || secret === "placeholder" || !hasDb()) return new Response("Not configured", { status: 503 });

  const raw = await req.text(); // the signature is over the exact raw body
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEq(expected, sig)) return new Response("Bad signature", { status: 400 });

  let evt: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try { evt = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }

  if (evt.event === "payment.captured") {
    const p = evt.payload?.payment?.entity;
    if (p?.id && p.order_id) {
      const r = await recordRazorpay(p.order_id, p.id, null);
      if (!r.ok) console.error("webhook record failed:", r.error);
    }
  }
  return new Response("ok"); // always 200 for valid signatures so Razorpay doesn't retry forever
}
