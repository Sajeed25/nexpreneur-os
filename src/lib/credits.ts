import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tx } from "@/lib/payments-server";
import { CYCLE_MONTHS } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { currentCycleStart, grantDue, type Balance } from "@/lib/credit-math";
import { notify } from "@/lib/notify";

const { creditLedger, memberships, membershipPlans, users } = schema;
type Exec = ReturnType<typeof db> | Tx;
export type CreditKind = "room_min" | "day_pass";

/** Current balance: the sum of every ledger entry. */
export async function creditBalance(exec: Exec, userId: string): Promise<Balance> {
  const rows = await exec.select({ kind: creditLedger.kind, v: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` }).from(creditLedger)
    .where(eq(creditLedger.userId, userId)).groupBy(creditLedger.kind);
  const get = (k: CreditKind) => Math.max(0, Number(rows.find((r) => r.kind === k)?.v ?? 0));
  return { minutes: get("room_min"), passes: get("day_pass") };
}

export async function postLedger(exec: Exec, e: {
  org: string; userId: string; kind: CreditKind; delta: number; reason: "grant" | "use" | "refund" | "expire" | "adjust";
  bookingId?: string | null; membershipId?: string | null; note?: string | null; createdBy?: string | null;
}) {
  if (!e.delta) return;
  await exec.insert(creditLedger).values({
    organizationId: e.org, userId: e.userId, kind: e.kind, delta: Math.round(e.delta), reason: e.reason,
    bookingId: e.bookingId ?? null, membershipId: e.membershipId ?? null, note: e.note?.slice(0, 200) ?? null, createdBy: e.createdBy ?? null,
  });
}

/** Locks the member's user row so two bookings made at the same moment can't spend the same credits twice. */
export async function lockUser(tx: Tx, userId: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
}

/** Puts credits back for a booking (once). Safe to call twice: it only refunds what is still outstanding. */
export async function refundBookingCredits(tx: Tx, b: { id: string; organizationId: string; userId: string; creditMinutes: number; creditPasses: number }) {
  if (!b.creditMinutes && !b.creditPasses) return;
  const [r] = await tx.select({ n: sql<number>`count(*)` }).from(creditLedger).where(and(eq(creditLedger.bookingId, b.id), eq(creditLedger.reason, "refund")));
  if (Number(r.n) > 0) return;
  await postLedger(tx, { org: b.organizationId, userId: b.userId, kind: "room_min", delta: b.creditMinutes, reason: "refund", bookingId: b.id, note: "Booking cancelled" });
  await postLedger(tx, { org: b.organizationId, userId: b.userId, kind: "day_pass", delta: b.creditPasses, reason: "refund", bookingId: b.id, note: "Booking cancelled" });
}

/**
 * Grants this cycle's credits for one membership if they are due. The previous cycle's unused credits expire first
 * (credits don't roll over). Runs under a lock on the membership row, so it is safe to call from several places.
 */
export async function grantForMembership(tx: Tx, membershipId: string, today = todayIST()): Promise<boolean> {
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId)).for("update");
  if (!m || m.status !== "active") return false;
  const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, m.planId));
  if (!plan) return false;
  const minutes = Math.max(0, (plan.bookingCredits ?? 0)) * 60, passes = Math.max(0, plan.includedDays ?? 0);
  if (!minutes && !passes) return false;
  const cs = currentCycleStart(m.startDate, CYCLE_MONTHS[plan.billingCycle] ?? 1, today);
  if (!grantDue(cs, m.creditsCycleStart)) return false;

  for (const [kind, amount] of [["room_min", minutes], ["day_pass", passes]] as const) {
    if (!amount) continue;
    if (m.creditsCycleStart) {
      // Expire what is left of the previous cycle's grant.
      const [last] = await tx.select({ d: creditLedger.delta }).from(creditLedger)
        .where(and(eq(creditLedger.membershipId, m.id), eq(creditLedger.kind, kind), eq(creditLedger.reason, "grant"))).orderBy(desc(creditLedger.createdAt)).limit(1);
      const bal = await creditBalance(tx, m.userId);
      const left = kind === "room_min" ? bal.minutes : bal.passes;
      const expire = Math.min(left, last?.d ?? 0);
      await postLedger(tx, { org: m.organizationId, userId: m.userId, kind, delta: -expire, reason: "expire", membershipId: m.id, note: "Previous cycle ended" });
    }
    await postLedger(tx, { org: m.organizationId, userId: m.userId, kind, delta: amount, reason: "grant", membershipId: m.id, note: `${plan.name}: cycle from ${cs}` });
  }
  await tx.update(memberships).set({ creditsCycleStart: cs }).where(eq(memberships.id, m.id));
  await notify(tx, { org: m.organizationId, userId: m.userId, kind: "booking", title: "Your plan credits are ready",
    body: [minutes ? `${minutes / 60} meeting-room hours` : "", passes ? `${passes} day pass${passes > 1 ? "es" : ""}` : ""].filter(Boolean).join(" and ") + " this cycle.", link: "/bookings/new" });
  return true;
}

/** Daily pass: grants this cycle's credits to every active membership whose plan includes some. Safe to run repeatedly. */
export async function runCreditGrants(today = todayIST()) {
  const d = db();
  const rows = await d.select({ id: memberships.id }).from(memberships).innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    // An archived plan still gives credits to the people already on it.
    .where(and(eq(memberships.status, "active"), sql`(${membershipPlans.bookingCredits} > 0 or ${membershipPlans.includedDays} > 0)`)).limit(5000);
  let granted = 0, errors = 0;
  for (const { id } of rows) {
    try { if (await d.transaction((tx) => grantForMembership(tx, id, today))) granted++; }
    catch (e) { errors++; console.error("credit grant failed for membership", id, e); }
  }
  return { granted, errors };
}

/** Credit balances for a set of users (for member lists). */
export async function balancesFor(userIds: string[]) {
  if (!userIds.length) return new Map<string, Balance>();
  const rows = await db().select({ u: creditLedger.userId, kind: creditLedger.kind, v: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` }).from(creditLedger)
    .where(inArray(creditLedger.userId, userIds)).groupBy(creditLedger.userId, creditLedger.kind);
  const out = new Map<string, Balance>();
  for (const r of rows) {
    const b = out.get(r.u) ?? { minutes: 0, passes: 0 };
    if (r.kind === "room_min") b.minutes = Math.max(0, Number(r.v)); else b.passes = Math.max(0, Number(r.v));
    out.set(r.u, b);
  }
  return out;
}
