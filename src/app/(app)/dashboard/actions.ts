"use server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

const { bookings, resources, memberships, membershipPlans, invoices } = schema;
export type MemberHomeDTO = {
  nextBooking: { name: string; startsAt: string; endsAt: string } | null;
  membership: { plan: string; pricePaise: number; cycle: string; renewalDate: string } | null;
  owedPaise: number;
};

export async function getMemberHome(): Promise<{ ok: true; data: MemberHomeDTO } | { ok: false; error: string }> {
  const s = await getSession();
  if (!s || s.demo || !hasDb()) return { ok: false, error: "Sign in with a real account to see your home." };
  const d = db();
  const [b] = await d.select({ name: resources.name, startsAt: bookings.startsAt, endsAt: bookings.endsAt }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(and(eq(bookings.organizationId, s.org), eq(bookings.userId, s.uid), inArray(bookings.status, ["confirmed", "pending"]), gte(bookings.endsAt, new Date())))
    .orderBy(asc(bookings.startsAt)).limit(1);
  const [m] = await d.select({ plan: membershipPlans.name, pricePaise: membershipPlans.pricePaise, cycle: membershipPlans.billingCycle, renewalDate: memberships.renewalDate }).from(memberships)
    .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .where(and(eq(memberships.organizationId, s.org), eq(memberships.userId, s.uid), eq(memberships.status, "active")))
    .orderBy(asc(memberships.renewalDate)).limit(1);
  const [o] = await d.select({ v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), eq(invoices.userId, s.uid), inArray(invoices.status, ["unpaid", "partial"])));
  return { ok: true, data: {
    nextBooking: b ? { name: b.name, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() } : null,
    membership: m ?? null, owedPaise: Number(o.v),
  } };
}
