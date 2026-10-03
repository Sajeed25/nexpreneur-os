"use server";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { computeAnalytics, RANGES, type Analytics, type RangeKey } from "@/lib/analytics";

const { bookings, resources, memberships, membershipPlans, invoices, payments, leads, events, auditLogs, users } = schema;
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

export type DashboardDTO = {
  analytics: Analytics; finance: boolean;
  activity: { text: string; at: string }[];
  upcomingBookings: { who: string; what: string; startsAt: string }[];
  recentPayments: { who: string; ref: string; amountPaise: number }[] | null;
  events: { title: string; startsAt: string }[];
  leads: { name: string; plan: string; valuePaise: number }[] | null;
  renewals: { who: string; plan: string; date: string }[] | null;
};

const ACTION_TEXT: Record<string, string> = {
  "auth.login": "signed in", "auth.register": "created an account", "booking.create": "booked a space", "booking.cancel": "cancelled a booking",
  "invoice.create": "issued an invoice", "invoice.void": "voided an invoice", "payment.record": "recorded a payment", "visitor.invite": "invited a visitor",
  "visitor.check_in": "checked a visitor in", "visitor.check_out": "checked a visitor out", "lead.create": "added a lead", "event.create": "created an event",
  "post.create": "posted in the community", "ticket.create": "opened a support request", "profile.update": "updated their profile",
};

/** Admin dashboard. Money figures and money lists are only returned to finance-capable roles. */
export async function getDashboard(range: string): Promise<{ ok: true; data: DashboardDTO } | { ok: false; error: string }> {
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !can(s.role, "dashboard") || s.role === "member") return { ok: false, error: "demo" };
  if (!(RANGES as string[]).includes(range)) return { ok: false, error: "Invalid range" };
  const finance = isFinance(s.role);
  const d = db();
  const now = new Date();
  const [analytics, bks, pays, lds, evs, rens, acts] = await Promise.all([
    computeAnalytics(s.org, range as RangeKey, { finance }),
    d.select({ who: users.name, what: resources.name, startsAt: bookings.startsAt }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(users, eq(users.id, bookings.userId))
      .where(and(eq(bookings.organizationId, s.org), inArray(bookings.status, ["confirmed", "pending"]), gte(bookings.endsAt, now))).orderBy(asc(bookings.startsAt)).limit(5),
    finance ? d.select({ who: users.name, ref: invoices.number, amt: payments.amountPaise }).from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(users, eq(users.id, payments.userId))
      .where(and(eq(payments.organizationId, s.org), eq(payments.status, "captured"))).orderBy(desc(payments.createdAt)).limit(5) : Promise.resolve(null),
    can(s.role, "crm") ? d.select().from(leads).where(eq(leads.organizationId, s.org)).orderBy(desc(leads.createdAt)).limit(5) : Promise.resolve(null),
    can(s.role, "events") ? d.select({ title: events.title, startsAt: events.startsAt }).from(events)
      .where(and(eq(events.organizationId, s.org), eq(events.published, true), gte(events.endsAt, now))).orderBy(asc(events.startsAt)).limit(5) : Promise.resolve([]),
    finance ? d.select({ who: users.name, plan: membershipPlans.name, date: memberships.renewalDate }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId)).innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
      .where(and(eq(memberships.organizationId, s.org), eq(memberships.status, "active"), gte(memberships.renewalDate, todayIST()))).orderBy(asc(memberships.renewalDate)).limit(5) : Promise.resolve(null),
    d.select({ who: users.name, action: auditLogs.action, at: auditLogs.createdAt }).from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId)).where(eq(auditLogs.organizationId, s.org)).orderBy(desc(auditLogs.createdAt)).limit(8),
  ]);
  return { ok: true, data: {
    analytics, finance,
    activity: acts.filter((a) => a.action !== "auth.login").slice(0, 6).map((a) => ({ text: `${a.who ?? "Someone"} ${ACTION_TEXT[a.action] ?? a.action}`, at: a.at.toISOString() })),
    upcomingBookings: bks.map((b) => ({ who: b.who, what: b.what, startsAt: b.startsAt.toISOString() })),
    recentPayments: pays?.map((p) => ({ who: p.who, ref: p.ref, amountPaise: p.amt })) ?? null,
    events: evs.map((e) => ({ title: e.title, startsAt: e.startsAt.toISOString() })),
    leads: lds?.map((l) => ({ name: l.name, plan: l.interestedPlan ?? "", valuePaise: l.expectedValuePaise })) ?? null,
    renewals: rens?.map((r) => ({ who: r.who, plan: r.plan, date: r.date })) ?? null,
  } };
}