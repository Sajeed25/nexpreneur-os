"use server";
import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CITY, CLOSE_HOUR, OPEN_HOUR, fmtIST, istToDate, price, rupees, type Kind } from "@/lib/booking";
import { notify } from "@/lib/notify";

const { resources, bookings, locations, users, auditLogs } = schema;

export type ResourceDTO = {
  id: string; name: string; kind: Kind; capacity: number; status: string; city: string;
  hourlyPricePaise: number | null; dailyPricePaise: number | null;
};
export type BookingDTO = {
  id: string; resourceId: string; resourceName: string; kind: Kind; city: string; who: string;
  startsAt: string; endsAt: string; status: string; totalPaise: number;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctx() {
  const s = await getSession();
  if (!s || !can(s.role, "bookings")) return null;
  if (!hasDb() || s.demo) return null;
  return s;
}
const NO_ACCESS = "Connect the database and sign in with a real account to use bookings.";

async function locationIds(org: string, city: string | null) {
  const rows = await db().select({ id: locations.id, city: locations.city }).from(locations)
    .where(and(eq(locations.organizationId, org), isNull(locations.deletedAt)));
  return { all: rows, picked: city ? rows.filter((r) => r.city === city).map((r) => r.id) : rows.map((r) => r.id) };
}

export async function listResources(loc: string): Promise<Result<ResourceDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO_ACCESS };
  const { all, picked } = await locationIds(s.org, CITY[loc] ?? null);
  if (!picked.length) return { ok: true, data: [] };
  const rows = await db().select().from(resources)
    .where(and(eq(resources.organizationId, s.org), inArray(resources.locationId, picked), isNull(resources.deletedAt)))
    .orderBy(asc(resources.kind), asc(resources.name));
  return { ok: true, data: rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, capacity: r.capacity, status: r.status,
    city: all.find((l) => l.id === r.locationId)?.city ?? "",
    hourlyPricePaise: r.hourlyPricePaise, dailyPricePaise: r.dailyPricePaise,
  })) };
}

const range = z.object({ loc: z.string(), from: z.string().datetime(), to: z.string().datetime() });

export async function listBookings(input: z.infer<typeof range>): Promise<Result<BookingDTO[]>> {
  const s = await ctx();
  const p = range.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid date range" : NO_ACCESS };
  const { all, picked } = await locationIds(s.org, CITY[p.data.loc] ?? null);
  if (!picked.length) return { ok: true, data: [] };
  const seesAll = s.role !== "member";
  const rows = await db().select({ b: bookings, r: resources, u: users }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(and(
      eq(bookings.organizationId, s.org), inArray(bookings.locationId, picked),
      lt(bookings.startsAt, new Date(p.data.to)), gt(bookings.endsAt, new Date(p.data.from)),
      seesAll ? undefined : eq(bookings.userId, s.uid),
    )).orderBy(asc(bookings.startsAt)).limit(500);
  return { ok: true, data: rows.map(({ b, r, u }) => ({
    id: b.id, resourceId: r.id, resourceName: r.name, kind: r.kind, city: all.find((l) => l.id === b.locationId)?.city ?? "",
    who: u.name, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), status: b.status, totalPaise: b.totalPaise,
  })) };
}

const timing = z.object({
  loc: z.string(), kind: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/),
});

function window(t: { date: string; start: string; end: string }): { start: Date; end: Date } | string {
  const start = istToDate(t.date, t.start), end = istToDate(t.date, t.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Invalid date or time";
  if (end <= start) return "End time must be after start time";
  if ((end.getTime() - start.getTime()) / 3_600_000 > 12) return "Bookings can be at most 12 hours";
  if (start.getTime() < Date.now() - 5 * 60_000) return "Start time is in the past";
  const sh = Number(t.start.slice(0, 2)), eh = Number(t.end.slice(0, 2)) + (t.end.slice(3) === "00" ? 0 : 1);
  if (sh < OPEN_HOUR || eh > CLOSE_HOUR) return `Bookings must be between ${OPEN_HOUR}:00 and ${CLOSE_HOUR}:00`;
  return { start, end };
}

export type Availability = ResourceDTO & { available: boolean; subtotal: number; tax: number; total: number };

export async function checkAvailability(input: z.infer<typeof timing>): Promise<Result<Availability[]>> {
  const s = await ctx();
  const p = timing.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const w = window(p.data);
  if (typeof w === "string") return { ok: false, error: w };
  const res = await listResources(p.data.loc);
  if (!res.ok) return res;
  const pool = res.data.filter((r) => r.kind === p.data.kind);
  if (!pool.length) return { ok: true, data: [] };
  const busy = await db().select({ id: bookings.resourceId }).from(bookings).where(and(
    eq(bookings.organizationId, s.org), inArray(bookings.resourceId, pool.map((r) => r.id)),
    inArray(bookings.status, ["confirmed", "pending"]), lt(bookings.startsAt, w.end), gt(bookings.endsAt, w.start),
  ));
  const taken = new Set(busy.map((b) => b.id));
  return { ok: true, data: pool.map((r) => {
    const pr = price(r, w.start, w.end);
    return { ...r, available: r.status === "available" && !taken.has(r.id), subtotal: pr.subtotal, tax: pr.tax, total: pr.total };
  }) };
}

const create = timing.omit({ loc: true, kind: true }).extend({ resourceId: z.string().uuid() });

export async function createBooking(input: z.infer<typeof create>): Promise<Result<{ id: string; total: number }>> {
  const s = await ctx();
  const p = create.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const w = window(p.data);
  if (typeof w === "string") return { ok: false, error: w };
  try {
    return await db().transaction(async (tx) => {
      // Lock the resource row so two people can't book the same slot at the same moment.
      const [r] = await tx.select().from(resources)
        .where(and(eq(resources.id, p.data.resourceId), eq(resources.organizationId, s.org), isNull(resources.deletedAt)))
        .for("update");
      if (!r) return { ok: false as const, error: "Resource not found" };
      if (r.status !== "available") return { ok: false as const, error: "This resource isn't available" };
      const clash = await tx.select({ id: bookings.id }).from(bookings).where(and(
        eq(bookings.resourceId, r.id), inArray(bookings.status, ["confirmed", "pending"]),
        lt(bookings.startsAt, w.end), gt(bookings.endsAt, w.start),
      )).limit(1);
      if (clash.length) return { ok: false as const, error: "Sorry, that slot was just taken. Pick another time." };
      const pr = price(r, w.start, w.end);
      const id = crypto.randomUUID();
      await tx.insert(bookings).values({
        id, organizationId: s.org, locationId: r.locationId, resourceId: r.id, userId: s.uid,
        startsAt: w.start, endsAt: w.end, status: "confirmed", subtotalPaise: pr.subtotal, taxPaise: pr.tax, totalPaise: pr.total,
      });
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "booking.create", entity: "booking", entityId: id });
      await notify(tx, { org: s.org, userId: s.uid, kind: "booking", title: `Booking confirmed: ${r.name}`, body: `${fmtIST(w.start.toISOString(), { weekday: "short", day: "numeric", month: "short" })}, ${fmtIST(w.start.toISOString(), { hour: "numeric", minute: "2-digit" })} to ${fmtIST(w.end.toISOString(), { hour: "numeric", minute: "2-digit" })} · ${rupees(pr.total)}`, link: "/bookings" });
      return { ok: true as const, data: { id, total: pr.total } };
    });
  } catch (e) {
    console.error("createBooking failed", e);
    return { ok: false, error: "Couldn't create the booking. Please try again." };
  }
}

export async function cancelBooking(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const [b] = await db().select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.organizationId, s.org))).limit(1);
  if (!b) return { ok: false, error: "Booking not found" };
  // Members may only cancel their own; staff roles may cancel any.
  if (s.role === "member" && b.userId !== s.uid) return { ok: false, error: "You can only cancel your own bookings" };
  if (b.status !== "confirmed" && b.status !== "pending") return { ok: false, error: "This booking can't be cancelled" };
  await db().update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "booking.cancel", entity: "booking", entityId: id });
  await notify(db(), { org: s.org, userId: b.userId, kind: "booking", title: "Booking cancelled", body: s.uid === b.userId ? undefined : "Cancelled by the front desk.", link: "/bookings" });
  return { ok: true, data: null };
}

const MANAGERS = ["super_admin", "owner", "location_manager"];
const D = (n: number, f: (i: number) => { name: string; kind: Kind; capacity: number; hourly?: number; daily?: number }) =>
  Array.from({ length: n }, (_, i) => f(i));
const pad = (i: number) => String(i + 1).padStart(2, "0");

/** One-click demo inventory so the booking screens have something to show. Skips locations that already have resources. */
export async function seedResources(): Promise<Result<{ created: number }>> {
  const s = await ctx();
  if (!s || !MANAGERS.includes(s.role)) return { ok: false, error: s ? "Only owners and managers can do this" : NO_ACCESS };
  const { all } = await locationIds(s.org, null);
  let created = 0;
  for (const loc of all) {
    const have = await db().select({ id: resources.id }).from(resources).where(eq(resources.locationId, loc.id)).limit(1);
    if (have.length) continue;
    const hyd = loc.city === "Hyderabad";
    const items = hyd ? [
      ...D(16, (i) => ({ name: `Hot Desk H${pad(i)}`, kind: "hot_desk" as Kind, capacity: 1, daily: 30000 })),
      ...D(6, (i) => ({ name: `Dedicated Desk D${pad(i)}`, kind: "dedicated_desk" as Kind, capacity: 1, daily: 40000 })),
      { name: "Meeting Room A", kind: "meeting_room" as Kind, capacity: 6, hourly: 80000 },
      { name: "Meeting Room B", kind: "meeting_room" as Kind, capacity: 8, hourly: 100000 },
      ...D(2, (i) => ({ name: `Phone Booth ${i + 1}`, kind: "phone_booth" as Kind, capacity: 1, hourly: 15000 })),
      { name: "Private Office P1", kind: "private_office" as Kind, capacity: 6, daily: 150000 },
      { name: "Event Space", kind: "event_space" as Kind, capacity: 60, hourly: 600000 },
    ] : [
      ...D(4, (i) => ({ name: `Hot Desk ${loc.city?.[0] ?? "X"}${pad(i)}`, kind: "hot_desk" as Kind, capacity: 1, daily: 25000 })),
      { name: `${loc.city} Meeting Room`, kind: "meeting_room" as Kind, capacity: 6, hourly: 60000 },
    ];
    await db().insert(resources).values(items.map((x) => ({
      organizationId: s.org, locationId: loc.id, name: x.name, kind: x.kind, capacity: x.capacity,
      hourlyPricePaise: x.hourly ?? null, dailyPricePaise: x.daily ?? null,
    })));
    created += items.length;
  }
  return { ok: true, data: { created } };
}
