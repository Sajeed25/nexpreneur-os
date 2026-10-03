import "server-only";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CITY, CLOSE_HOUR, OPEN_HOUR, todayIST } from "@/lib/booking";
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
export async function computeAnalytics(org: string, range: RangeKey, opts: { finance: boolean; locationId?: string | null }): Promise<Analytics> {
  const only = opts.locationId ?? null; // when set, location-aware figures are narrowed to this location
  const d = db();
  const buckets = makeBuckets(range);
  const from = new Date(buckets[0].start), to = new Date(buckets[buckets.length - 1].end);

  const [pays, bks, members, mems, lds, res, locs, owed] = await Promise.all([
    opts.finance
      ? d.select({ at: payments.createdAt, amt: payments.amountPaise, loc: invoices.locationId }).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
          .where(and(eq(payments.organizationId, org), eq(payments.status, "captured"), gte(payments.createdAt, from), lt(payments.createdAt, to))).limit(20000)
      : Promise.resolve([]),
    d.select({ s: bookings.startsAt, e: bookings.endsAt, loc: bookings.locationId, res: bookings.resourceId, total: bookings.totalPaise, kind: resources.kind }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(eq(bookings.organizationId, org), inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.endsAt, from), lt(bookings.startsAt, to))).limit(20000),
    d.select({ at: users.createdAt }).from(users).where(and(eq(users.organizationId, org), eq(users.role, "member"), isNull(users.deletedAt))).limit(50000),
    d.select({ user: memberships.userId, status: memberships.status, renewal: memberships.renewalDate, cancelled: memberships.cancelledAt, started: memberships.createdAt, loc: memberships.locationId, price: membershipPlans.pricePaise, cycle: membershipPlans.billingCycle }).from(memberships)
      .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId)).where(eq(memberships.organizationId, org)).limit(50000),
    d.select({ at: leads.createdAt, stage: leads.stage }).from(leads).where(and(eq(leads.organizationId, org), gte(leads.createdAt, from))).limit(20000),
    d.select({ id: resources.id, loc: resources.locationId, kind: resources.kind }).from(resources).where(and(eq(resources.organizationId, org), isNull(resources.deletedAt))),
    d.select({ id: locations.id, city: locations.city }).from(locations).where(and(eq(locations.organizationId, org), isNull(locations.deletedAt))),
    opts.finance
      ? d.select({ v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices).where(and(eq(invoices.organizationId, org), inArray(invoices.status, ["unpaid", "partial"]), only ? eq(invoices.locationId, only) : undefined))
      : Promise.resolve([{ v: 0 }]),
  ]);

  // Location-aware inputs. Leads (no location) and the per-location table always cover the whole organisation.
  const rPays = only ? pays.filter((p) => p.loc === only) : pays;
  const rBks = only ? bks.filter((b) => b.loc === only) : bks;
  const rRes = only ? res.filter((r) => r.loc === only) : res;
  const rMems = only ? mems.filter((m) => m.loc === only) : mems;
  const nRes = rRes.length;
  const rooms = rRes.filter((r) => r.kind === "meeting_room");
  const hoursOf = (b: { s: Date; e: Date }, bk: Bucket) => overlapHours(b.s.getTime(), b.e.getTime(), bk.start, bk.end);

  // "Members" = everyone who signed up, or (for one location) people whose first membership started there.
  const firstStart = new Map<string, Date>();
  for (const m of rMems) { const cur = firstStart.get(m.user); if (!cur || m.started < cur) firstStart.set(m.user, m.started); }
  const joined = only ? [...firstStart.values()] : members.map((m) => m.at);

  const revenue = buckets.map((bk) => ({ label: bk.label, value: Math.round(rPays.filter((p) => p.at.getTime() >= bk.start && p.at.getTime() < bk.end).reduce((s, p) => s + p.amt, 0) / 100) }));
  const occupancy = buckets.map((bk) => ({ label: bk.label, value: pct(rBks.reduce((s, b) => s + hoursOf(b, bk), 0), nRes * bk.hours) }));
  const bookingsSeries = buckets.map((bk) => ({ label: bk.label, value: rBks.filter((b) => b.s.getTime() >= bk.start && b.s.getTime() < bk.end).length }));
  const membersSeries = buckets.map((bk) => ({ label: bk.label, value: joined.filter((j) => j.getTime() < bk.end).length }));

  // A membership ended when it was cancelled (exact date), or expired (dated by its renewal date).
  const endedAll = rMems.filter((m) => m.status === "cancelled" || m.status === "expired");
  const endedAt = (m: (typeof endedAll)[number]) => (m.cancelled ? m.cancelled.getTime() : istDayStart(m.renewal));
  const ended = buckets.map((bk) => ({ label: bk.label, value: endedAll.filter((m) => { const t = endedAt(m); return t >= bk.start && t < bk.end; }).length }));

  const active = rMems.filter((m) => m.status === "active");
  const mrr = active.reduce((s, m) => s + monthly(m.price, m.cycle), 0);
  const activeUsers = new Set(active.map((m) => m.user)).size;
  const endedInRange = endedAll.filter((m) => { const t = endedAt(m); return t >= from.getTime() && t < to.getTime(); }).length;
  const rangeHours = buckets.reduce((s, b) => s + b.hours, 0);
  const wonLeads = lds.filter((l) => l.stage === "won").length;
  const hoursIn = (b: { s: Date; e: Date }) => overlapHours(b.s.getTime(), b.e.getTime(), from.getTime(), to.getTime());

  const perLoc = locs.map((l) => {
    const rs = res.filter((r) => r.loc === l.id).length;
    const lb = bks.filter((b) => b.loc === l.id);
    return { city: l.city ?? "", bookings: lb.length, revenuePaise: lb.reduce((s, b) => s + b.total, 0), occupancyPct: pct(lb.reduce((s, b) => s + hoursIn(b), 0), rs * rangeHours) };
  });

  return {
    range,
    kpis: {
      collectedPaise: rPays.reduce((s, p) => s + p.amt, 0), mrrPaise: mrr, arrPaise: mrr * 12, activeMembers: activeUsers,
      newMembers: joined.filter((j) => j >= from && j < to).length, churnPct: pct(endedInRange, active.length + endedInRange),
      bookings: rBks.filter((b) => b.s >= from && b.s < to).length,
      occupancyPct: pct(rBks.reduce((s, b) => s + hoursIn(b), 0), nRes * rangeHours),
      roomUtilPct: pct(rBks.filter((b) => b.kind === "meeting_room").reduce((s, b) => s + hoursIn(b), 0), rooms.length * rangeHours),
      arpmPaise: activeUsers ? Math.round(mrr / activeUsers) : 0, leadConvPct: pct(wonLeads, lds.length),
      memberConvPct: pct(new Set(mems.map((m) => m.user)).size, members.length), outstandingPaise: Number(owed[0]?.v ?? 0),
    },
    series: { revenue, occupancy, members: membersSeries, bookings: bookingsSeries, ended },
    locations: perLoc,
  };
}
/** Maps the top-bar location key ("hyd", "wgl", "nlg", "all") to a location id, or null for the whole organisation. */
export async function locationIdFor(org: string, key: string | undefined): Promise<string | null> {
  const city = CITY[key ?? "all"];
  if (!city) return null;
  const [l] = await db().select({ id: locations.id }).from(locations).where(and(eq(locations.organizationId, org), eq(locations.city, city), isNull(locations.deletedAt)));
  return l?.id ?? null;
}
