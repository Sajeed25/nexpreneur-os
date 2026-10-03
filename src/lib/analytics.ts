import "server-only";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CLOSE_HOUR, OPEN_HOUR, todayIST } from "@/lib/booking";
import { CYCLE_MONTHS } from "@/lib/billing";

const { payments, bookings, resources, locations, users, memberships, membershipPlans, leads, invoices } = schema;

export type RangeKey = "today" | "7d" | "30d" | "90d" | "year";
export const RANGES: RangeKey[] = ["today", "7d", "30d", "90d", "year"];
export type Point = { label: string; value: number };
export type Analytics = {
  range: RangeKey;
  kpis: {
    collectedPaise: number; mrrPaise: number; arrPaise: number; activeMembers: number; newMembers: number; churnPct: number;
    bookings: number; occupancyPct: number; roomUtilPct: number; arpmPaise: number; leadConvPct: number; memberConvPct: number; outstandingPaise: number;
  };
  series: { revenue: Point[]; occupancy: Point[]; members: Point[]; bookings: Point[]; ended: Point[] };
  locations: { city: string; bookings: number; revenuePaise: number; occupancyPct: number }[];
};

const IST_MS = 5.5 * 3_600_000;
const DAY = 86_400_000;
const istDayStart = (iso: string) => new Date(`${iso}T00:00:00+05:30`).getTime();
const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...o });

type Bucket = { start: number; end: number; label: string; hours: number };

/** Chart buckets in IST: hourly for today, daily up to 30 days, weekly for 90 days, monthly for the year. */
export function makeBuckets(range: RangeKey): Bucket[] {
  const todayStart = istDayStart(todayIST());
  const out: Bucket[] = [];
  if (range === "today") {
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) out.push({ start: todayStart + h * 3_600_000, end: todayStart + (h + 1) * 3_600_000, label: `${h}:00`, hours: 1 });
  } else if (range === "7d" || range === "30d") {
    const n = range === "7d" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) { const s = todayStart - i * DAY; out.push({ start: s, end: s + DAY, label: fmt(s, { day: "numeric", month: "short" }), hours: CLOSE_HOUR - OPEN_HOUR }); }
  } else if (range === "90d") {
    for (let i = 12; i >= 0; i--) { const e = todayStart + DAY - i * 7 * DAY; const s = e - 7 * DAY; out.push({ start: s, end: e, label: fmt(s, { day: "numeric", month: "short" }), hours: 7 * (CLOSE_HOUR - OPEN_HOUR) }); }
  } else {
    const now = new Date(Date.now() + IST_MS);
    const y = now.getUTCFullYear();
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      const s = Date.UTC(y, m, 1) - IST_MS, e = Date.UTC(y, m + 1, 1) - IST_MS;
      out.push({ start: s, end: e, label: fmt(s, { month: "short" }), hours: ((e - s) / DAY) * (CLOSE_HOUR - OPEN_HOUR) });
    }
  }
  return out;
}

const overlapHours = (aS: number, aE: number, bS: number, bE: number) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS)) / 3_600_000;
const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 1000) / 10) : 0);
const monthly = (price: number, cycle: string) => Math.round(price / (CYCLE_MONTHS[cycle] ?? 1));

/** All figures for one organisation. Amounts in paise. Computed in JS from bounded row sets (fine for a coworking-sized dataset). */
export async function computeAnalytics(org: string, range: RangeKey, opts: { finance: boolean }): Promise<Analytics> {
  const d = db();
  const buckets = makeBuckets(range);
  const from = new Date(buckets[0].start), to = new Date(buckets[buckets.length - 1].end);

  const [pays, bks, members, mems, lds, res, locs, owed] = await Promise.all([
    opts.finance
      ? d.select({ at: payments.createdAt, amt: payments.amountPaise, inv: payments.invoiceId }).from(payments)
          .where(and(eq(payments.organizationId, org), eq(payments.status, "captured"), gte(payments.createdAt, from), lt(payments.createdAt, to))).limit(20000)
      : Promise.resolve([]),
    d.select({ s: bookings.startsAt, e: bookings.endsAt, loc: bookings.locationId, res: bookings.resourceId, total: bookings.totalPaise, kind: resources.kind }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(eq(bookings.organizationId, org), inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.endsAt, from), lt(bookings.startsAt, to))).limit(20000),
    d.select({ at: users.createdAt }).from(users).where(and(eq(users.organizationId, org), eq(users.role, "member"), isNull(users.deletedAt))).limit(50000),
    d.select({ user: memberships.userId, status: memberships.status, renewal: memberships.renewalDate, price: membershipPlans.pricePaise, cycle: membershipPlans.billingCycle }).from(memberships)
      .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId)).where(eq(memberships.organizationId, org)).limit(50000),
    d.select({ at: leads.createdAt, stage: leads.stage }).from(leads).where(and(eq(leads.organizationId, org), gte(leads.createdAt, from))).limit(20000),
    d.select({ id: resources.id, loc: resources.locationId, kind: resources.kind }).from(resources).where(and(eq(resources.organizationId, org), isNull(resources.deletedAt))),
    d.select({ id: locations.id, city: locations.city }).from(locations).where(and(eq(locations.organizationId, org), isNull(locations.deletedAt))),
    opts.finance
      ? d.select({ v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices).where(and(eq(invoices.organizationId, org), inArray(invoices.status, ["unpaid", "partial"])))
      : Promise.resolve([{ v: 0 }]),
  ]);

  const nRes = res.length;
  const rooms = res.filter((r) => r.kind === "meeting_room");
  const hoursOf = (b: { s: Date; e: Date }, bk: Bucket) => overlapHours(b.s.getTime(), b.e.getTime(), bk.start, bk.end);

  const revenue = buckets.map((bk) => ({ label: bk.label, value: Math.round(pays.filter((p) => p.at.getTime() >= bk.start && p.at.getTime() < bk.end).reduce((s, p) => s + p.amt, 0) / 100) }));
  const occupancy = buckets.map((bk) => ({ label: bk.label, value: pct(bks.reduce((s, b) => s + hoursOf(b, bk), 0), nRes * bk.hours) }));
  const bookingsSeries = buckets.map((bk) => ({ label: bk.label, value: bks.filter((b) => b.s.getTime() >= bk.start && b.s.getTime() < bk.end).length }));
  const membersSeries = buckets.map((bk) => ({ label: bk.label, value: members.filter((m) => m.at.getTime() < bk.end).length }));
  // Ended memberships are dated by their renewal date (we don't store a cancellation timestamp yet).
  const endedAll = mems.filter((m) => m.status === "cancelled" || m.status === "expired");
  const ended = buckets.map((bk) => ({ label: bk.label, value: endedAll.filter((m) => { const t = istDayStart(m.renewal); return t >= bk.start && t < bk.end; }).length }));

  const active = mems.filter((m) => m.status === "active");
  const mrr = active.reduce((s, m) => s + monthly(m.price, m.cycle), 0);
  const activeUsers = new Set(active.map((m) => m.user)).size;
  const endedInRange = endedAll.filter((m) => { const t = istDayStart(m.renewal); return t >= from.getTime() && t < to.getTime(); }).length;
  const rangeHours = buckets.reduce((s, b) => s + b.hours, 0);
  const wonLeads = lds.filter((l) => l.stage === "won").length;

  const perLoc = locs.map((l) => {
    const rs = res.filter((r) => r.loc === l.id).length;
    const lb = bks.filter((b) => b.loc === l.id);
    return { city: l.city ?? "", bookings: lb.length, revenuePaise: lb.reduce((s, b) => s + b.total, 0), occupancyPct: pct(lb.reduce((s, b) => s + overlapHours(b.s.getTime(), b.e.getTime(), from.getTime(), to.getTime()), 0), rs * rangeHours) };
  });

  return {
    range,
    kpis: {
      collectedPaise: pays.reduce((s, p) => s + p.amt, 0), mrrPaise: mrr, arrPaise: mrr * 12, activeMembers: activeUsers,
      newMembers: members.filter((m) => m.at >= from && m.at < to).length, churnPct: pct(endedInRange, active.length + endedInRange),
      bookings: bks.filter((b) => b.s >= from && b.s < to).length,
      occupancyPct: pct(bks.reduce((s, b) => s + overlapHours(b.s.getTime(), b.e.getTime(), from.getTime(), to.getTime()), 0), nRes * rangeHours),
      roomUtilPct: pct(bks.filter((b) => b.kind === "meeting_room").reduce((s, b) => s + overlapHours(b.s.getTime(), b.e.getTime(), from.getTime(), to.getTime()), 0), rooms.length * rangeHours),
      arpmPaise: activeUsers ? Math.round(mrr / activeUsers) : 0, leadConvPct: pct(wonLeads, lds.length),
      memberConvPct: pct(new Set(mems.map((m) => m.user)).size, members.length), outstandingPaise: Number(owed[0]?.v ?? 0),
    },
    series: { revenue, occupancy, members: membersSeries, bookings: bookingsSeries, ended },
    locations: perLoc,
  };
}
