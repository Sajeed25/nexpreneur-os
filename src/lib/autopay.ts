import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { rzp, rzpKeys } from "@/lib/payments-server";
import { notify } from "@/lib/notify";

const { autopayMandates, memberships, membershipPlans } = schema;

export class AutopayError extends Error {}

/** Razorpay plans repeat monthly or yearly; a quarterly plan is "every 3 months". */
export const AUTOPAY_PERIOD: Record<string, { period: "monthly" | "yearly"; interval: number; count: number }> = {
  monthly: { period: "monthly", interval: 1, count: 120 },
  quarterly: { period: "monthly", interval: 3, count: 40 },
  yearly: { period: "yearly", interval: 1, count: 10 },
};
export const ACTIVE_MANDATE = ["created", "authenticated", "active", "pending", "paused"];

/** What each renewal costs: the plan price plus 18% GST, as invoiced. */
export const renewalAmount = (pricePaise: number, taxPct = 18) => pricePaise + Math.round((pricePaise * taxPct) / 100);

/** First charge happens on the renewal date (the renewal invoice is issued a few days before). Razorpay needs a time in the future. */
export function firstChargeAt(renewalDate: string, now = Date.now()): number {
  const t = new Date(`${renewalDate}T09:00:00+05:30`).getTime();
  return Math.floor(Math.max(t, now + 2 * 3_600_000) / 1000);
}

export async function createMandate(org: string, userId: string, membershipId: string) {
  if (!rzpKeys()) throw new AutopayError("Autopay isn't set up yet. Ask your admin to add the Razorpay keys.");
  const [m] = await db().select({ m: memberships, p: membershipPlans }).from(memberships).innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, org), eq(memberships.userId, userId), eq(memberships.status, "active")));
  if (!m) throw new AutopayError("Membership not found.");
  const live = await db().select({ id: autopayMandates.id }).from(autopayMandates)
    .where(and(eq(autopayMandates.membershipId, membershipId), inArray(autopayMandates.status, ACTIVE_MANDATE)));
  if (live.length) throw new AutopayError("Autopay is already set up for this plan.");
  const cfg = AUTOPAY_PERIOD[m.p.billingCycle] ?? AUTOPAY_PERIOD.monthly;
  const amount = renewalAmount(m.p.pricePaise);
  const plan = await rzp<{ id: string }>("/plans", { method: "POST", body: { period: cfg.period, interval: cfg.interval, item: { name: `${m.p.name} membership`.slice(0, 100), amount, currency: "INR", description: "Nexpreneur membership renewal" } } });
  const sub = await rzp<{ id: string; short_url: string; status: string }>("/subscriptions", { method: "POST", body: {
    plan_id: plan.id, total_count: cfg.count, customer_notify: 0, start_at: firstChargeAt(m.m.renewalDate), notes: { membershipId, userId, org },
  } });
  await db().insert(autopayMandates).values({ organizationId: org, userId, membershipId, rzpPlanId: plan.id, rzpSubscriptionId: sub.id, status: sub.status || "created", shortUrl: sub.short_url?.slice(0, 300) ?? null });
  return { url: sub.short_url, amountPaise: amount };
}

export async function cancelMandate(org: string, userId: string, mandateId: string) {
  const [m] = await db().select().from(autopayMandates).where(and(eq(autopayMandates.id, mandateId), eq(autopayMandates.organizationId, org), eq(autopayMandates.userId, userId)));
  if (!m) throw new AutopayError("Autopay not found.");
  if (!ACTIVE_MANDATE.includes(m.status)) return;
  try { await rzp(`/subscriptions/${encodeURIComponent(m.rzpSubscriptionId)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 0 } }); }
  catch (e) {
    // A subscription that was never authorised can't be cancelled at Razorpay; it is safe to drop it here.
    if (!(e instanceof Error) || !/status|cancel|not/i.test(e.message)) throw new AutopayError("Couldn't cancel it with Razorpay. Try again.");
  }
  await db().update(autopayMandates).set({ status: "cancelled" }).where(eq(autopayMandates.id, m.id));
}

/** Webhook: a subscription changed state. Keeps our copy in step and tells the member when a charge keeps failing. */
export async function onSubscriptionEvent(event: string, subscriptionId: string, rzpStatus: string | undefined) {
  const [m] = await db().select().from(autopayMandates).where(eq(autopayMandates.rzpSubscriptionId, subscriptionId));
  if (!m) return false;
  const status = rzpStatus || event.replace("subscription.", "");
  await db().update(autopayMandates).set({ status: status.slice(0, 20) }).where(eq(autopayMandates.id, m.id));
  if (event === "subscription.halted") {
    await notify(db(), { org: m.organizationId, userId: m.userId, kind: "payment", title: "Autopay stopped: payment failed", body: "We couldn't collect your membership renewal. Please pay the invoice manually or set up autopay again.", link: "/memberships" });
  } else if (event === "subscription.activated") {
    await notify(db(), { org: m.organizationId, userId: m.userId, kind: "payment", title: "Autopay is on", body: "Your membership will renew automatically.", link: "/memberships" });
  }
  return true;
}

export type MandateDTO = { id: string; membershipId: string; status: string; shortUrl: string | null; amountPaise: number | null; createdAt: string };
export async function mandatesFor(org: string, userId: string): Promise<MandateDTO[]> {
  const rows = await db().select().from(autopayMandates).where(and(eq(autopayMandates.organizationId, org), eq(autopayMandates.userId, userId))).orderBy(desc(autopayMandates.createdAt)).limit(10);
  return rows.map((r) => ({ id: r.id, membershipId: r.membershipId, status: r.status, shortUrl: r.shortUrl, amountPaise: null, createdAt: r.createdAt.toISOString() }));
}
