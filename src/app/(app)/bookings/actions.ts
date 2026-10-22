"use server";
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CLOSE_HOUR, OPEN_HOUR, fmtIST, istToDate, price, rupees, type Kind } from "@/lib/booking";
import { notify } from "@/lib/notify";
import { matchLocations } from "@/lib/locations";
import { applyCredits, weeklyDates, MAX_REPEAT_WEEKS, type Balance } from "@/lib/credit-math";
import { creditBalance, lockUser, postLedger, refundBookingCredits } from "@/lib/credits";
import { offerFreedSlot } from "@/lib/waitlist";
import { after } from "next/server";
import { emailBookingConfirmation } from "@/lib/calendar";
import { blockedByOnboarding } from "@/lib/onboarding";

const { resources, bookings, locations, users, auditLogs, bookingWaitlist } = schema;

export type ResourceDTO = {
  id: string; name: string; kind: Kind; capacity: number; status: string; city: string; locationId: string;
  hourlyPricePaise: number | null; dailyPricePaise: number | null;
};
export type BookingDTO = {
  id: string; resourceId: string; resourceName: string; kind: Kind; city: string; who: string;
  startsAt: string; endsAt: string; status: string; totalPaise: number;
  seriesId: string | null; creditMinutes: number; creditPasses: number;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctx() {
  const s = await getSession();
  if (!s || !can(s.role, "bookings")) return null;
  if (!hasDb() || s.demo) return null;
  return s;
}
const NO_ACCESS = "Connect the database and sign in with a real account to use bookings.";

async function locationIds(org: string, key: string | null) {
  const rows = await db().select({ id: locations.id, name: locations.name, city: locations.city }).from(locations)
    .where(and(eq(locations.organizationId, org), isNull(locations.deletedAt)));
  return { all: rows, picked: matchLocations(rows, key) };
}

export async function listResources(loc: string): Promise<Result<ResourceDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO_ACCESS };
  const { all, picked } = await locationIds(s.org, loc);
  if (!picked.length) return { ok: true, data: [] };
  const rows = await db().select().from(resources)
    .where(and(eq(resources.organizationId, s.org), inArray(resources.locationId, picked), isNull(resources.deletedAt)))
    .orderBy(asc(resources.kind), asc(resources.name));
  return { ok: true, data: rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, capacity: r.capacity, status: r.status, locationId: r.locationId,
    city: all.find((l) => l.id === r.locationId)?.name ?? "",
    hourlyPricePaise: r.hourlyPricePaise, dailyPricePaise: r.dailyPricePaise,
  })) };
}

const range = z.object({ loc: z.string(), from: z.string().datetime(), to: z.string().datetime() });

export async function listBookings(input: z.infer<typeof range>): Promise<Result<BookingDTO[]>> {
  const s = await ctx();
  const p = range.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid date range" : NO_ACCESS };
  const { all, picked } = await locationIds(s.org, p.data.loc);
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
    id: b.id, resourceId: r.id, resourceName: r.name, kind: r.kind, city: all.find((l) => l.id === b.locationId)?.name ?? "",
    who: u.name, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), status: b.status, totalPaise: b.totalPaise,
    seriesId: b.seriesId, creditMinutes: b.creditMinutes, creditPasses: b.creditPasses,
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

export type Availability = ResourceDTO & {
  available: boolean; subtotal: number; tax: number; total: number;
  /** Price with no credits applied, and what the member's credits cover. */
  listTotal: number; creditMinutes: number; creditPasses: number;
};

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
  const bal = await creditBalance(db(), s.uid);
  return { ok: true, data: pool.map((r) => {
    const q = applyCredits(r, w.start, w.end, bal);
    return { ...r, available: r.status === "available" && !taken.has(r.id), subtotal: q.subtotal, tax: q.tax, total: q.total, listTotal: q.listTotal, creditMinutes: q.creditMinutes, creditPasses: q.creditPasses };
  }) };
}

const create = timing.omit({ loc: true, kind: true }).extend({
  resourceId: z.string().uuid(),
  /** Repeat the same slot every week for this many weeks in total (1 = just once). */
  repeatWeeks: z.number().int().min(1).max(MAX_REPEAT_WEEKS).optional(),
});

export type CreatedBooking = { id: string; total: number; created: number; skipped: { date: string; why: string }[]; creditMinutes: number; creditPasses: number; seriesId: string | null };

export async function createBooking(input: z.infer<typeof create>): Promise<Result<CreatedBooking>> {
  const s = await ctx();
  const p = create.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const dates = weeklyDates(p.data.date, p.data.repeatWeeks ?? 1);
  const first = window({ date: dates[0], start: p.data.start, end: p.data.end });
  if (typeof first === "string") return { ok: false, error: first };
  const ob = await blockedByOnboarding(s.org, s.uid, s.role);
  if (ob.blocked) return { ok: false, error: `Please finish setting up before you book: ${ob.missing.join(", ")}.` };
  try {
    const res = await db().transaction(async (tx) => {
      // Lock the member (so credits can't be spent twice at once), then the resource (so nobody else books the same slot).
      await lockUser(tx, s.uid);
      const [r] = await tx.select().from(resources)
        .where(and(eq(resources.id, p.data.resourceId), eq(resources.organizationId, s.org), isNull(resources.deletedAt)))
        .for("update");
      if (!r) return { ok: false as const, error: "Resource not found" };
      if (r.status !== "available") return { ok: false as const, error: "This resource isn't available" };

      const bal: Balance = await creditBalance(tx, s.uid);
      const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
      const made: { id: string; start: Date; end: Date }[] = [];
      const skipped: { date: string; why: string }[] = [];
      let total = 0, usedMinutes = 0, usedPasses = 0;

      for (const date of dates) {
        const w = window({ date, start: p.data.start, end: p.data.end });
        if (typeof w === "string") { skipped.push({ date, why: w }); continue; }
        const clash = await tx.select({ id: bookings.id }).from(bookings).where(and(
          eq(bookings.resourceId, r.id), inArray(bookings.status, ["confirmed", "pending"]),
          lt(bookings.startsAt, w.end), gt(bookings.endsAt, w.start),
        )).limit(1);
        if (clash.length) { skipped.push({ date, why: "already booked" }); continue; }
        const q = applyCredits(r, w.start, w.end, bal);
        const id = crypto.randomUUID();
        await tx.insert(bookings).values({
          id, organizationId: s.org, locationId: r.locationId, resourceId: r.id, userId: s.uid,
          startsAt: w.start, endsAt: w.end, status: "confirmed", subtotalPaise: q.subtotal, taxPaise: q.tax, totalPaise: q.total,
          creditMinutes: q.creditMinutes, creditPasses: q.creditPasses, seriesId,
        });
        await postLedger(tx, { org: s.org, userId: s.uid, kind: "room_min", delta: -q.creditMinutes, reason: "use", bookingId: id, note: r.name });
        await postLedger(tx, { org: s.org, userId: s.uid, kind: "day_pass", delta: -q.creditPasses, reason: "use", bookingId: id, note: r.name });
        bal.minutes -= q.creditMinutes; bal.passes -= q.creditPasses;
        usedMinutes += q.creditMinutes; usedPasses += q.creditPasses; total += q.total;
        made.push({ id, start: w.start, end: w.end });
      }
      if (!made.length) {
        return { ok: false as const, error: dates.length > 1 ? "None of those dates were free. Try another time." : (skipped[0]?.why === "already booked" ? "Sorry, that slot was just taken. Pick another time." : skipped[0]?.why ?? "Couldn't book that time.") };
      }
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: seriesId ? `booking.create_series:${made.length}` : "booking.create", entity: "booking", entityId: made[0].id });
      const when = (d: Date) => `${fmtIST(d.toISOString(), { weekday: "short", day: "numeric", month: "short" })}, ${fmtIST(d.toISOString(), { hour: "numeric", minute: "2-digit" })} to ${fmtIST(made[0].end.toISOString(), { hour: "numeric", minute: "2-digit" })}`;
      await notify(tx, {
        org: s.org, userId: s.uid, kind: "booking",
        title: made.length > 1 ? `Recurring booking confirmed: ${r.name}` : `Booking confirmed: ${r.name}`,
        body: `${when(made[0].start)}${made.length > 1 ? ` · ${made.length} weeks` : ""} · ${rupees(total)}${usedMinutes || usedPasses ? " (plan credits used)" : ""}`, link: "/bookings",
      });
      return { ok: true as const, data: { id: made[0].id, total, created: made.length, skipped, creditMinutes: usedMinutes, creditPasses: usedPasses, seriesId }, ids: made.map((m) => m.id) };
    });
    if (!res.ok) return res;
    const { ids, ...out } = res;
    // The email (with a calendar invite) goes out after the response, so a slow mail server never delays the booking.
    try { after(() => emailBookingConfirmation(s.uid, ids, { total: out.data.total, creditMinutes: out.data.creditMinutes, creditPasses: out.data.creditPasses })); } catch { /* outside a request */ }
    return out;
  } catch (e) {
    console.error("createBooking failed", e);
    return { ok: false, error: "Couldn't create the booking. Please try again." };
  }
}

/** Cancels one booking, or (scope "series") this and every later session of a recurring booking. Unused plan credits go back. */
export async function cancelBooking(id: string, scope: "one" | "series" = "one"): Promise<Result<{ cancelled: number }>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const [b] = await db().select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.organizationId, s.org))).limit(1);
  if (!b) return { ok: false, error: "Booking not found" };
  // Members may only cancel their own; staff roles may cancel any.
  if (s.role === "member" && b.userId !== s.uid) return { ok: false, error: "You can only cancel your own bookings" };
  if (b.status !== "confirmed" && b.status !== "pending") return { ok: false, error: "This booking can't be cancelled" };
  try {
    const n = await db().transaction(async (tx) => {
      const targets = scope === "series" && b.seriesId
        ? await tx.select().from(bookings).where(and(eq(bookings.seriesId, b.seriesId), eq(bookings.organizationId, s.org), inArray(bookings.status, ["confirmed", "pending"]), gt(bookings.startsAt, new Date(b.startsAt.getTime() - 1)))).for("update")
        : [b];
      let count = 0;
      for (const t of targets) {
        const r = await tx.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.id, t.id), inArray(bookings.status, ["confirmed", "pending"])));
        if (!(r[0] as { affectedRows?: number }).affectedRows) continue;
        count++;
        if (t.startsAt > new Date()) await refundBookingCredits(tx, t); // only unused credits come back
        await offerFreedSlot(tx, { org: s.org, resourceId: t.resourceId, locationId: t.locationId });
      }
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: count > 1 ? `booking.cancel_series:${count}` : "booking.cancel", entity: "booking", entityId: id });
      await notify(tx, { org: s.org, userId: b.userId, kind: "booking", title: count > 1 ? `${count} bookings cancelled` : "Booking cancelled", body: s.uid === b.userId ? undefined : "Cancelled by the front desk.", link: "/bookings" });
      return count;
    });
    return { ok: true, data: { cancelled: n } };
  } catch (e) {
    console.error("cancelBooking failed", e);
    return { ok: false, error: "Couldn't cancel the booking. Please try again." };
  }
}

/** Plan credits the signed-in person has left. */
export async function myCredits(): Promise<Result<Balance>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO_ACCESS };
  return { ok: true, data: await creditBalance(db(), s.uid) };
}

// ---------- Waitlist ----------
export type WaitlistDTO = { id: string; kind: string; locationName: string; startsAt: string; endsAt: string; status: string };

export async function joinWaitlist(input: z.infer<typeof timing>): Promise<Result<null>> {
  const s = await ctx();
  const p = timing.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  const w = window(p.data);
  if (typeof w === "string") return { ok: false, error: w };
  const { picked } = await locationIds(s.org, p.data.loc);
  if (picked.length !== 1) return { ok: false, error: "Pick one location (top of the page) to join its waitlist." };
  const mine = await db().select({ id: bookingWaitlist.id, kind: bookingWaitlist.kind, s: bookingWaitlist.startsAt }).from(bookingWaitlist)
    .where(and(eq(bookingWaitlist.userId, s.uid), inArray(bookingWaitlist.status, ["waiting", "notified"]), gt(bookingWaitlist.startsAt, new Date())));
  if (mine.length >= 10) return { ok: false, error: "You can wait for up to 10 slots at a time." };
  if (mine.some((m) => m.kind === p.data.kind && m.s.getTime() === w.start.getTime())) return { ok: false, error: "You're already on the waitlist for that time." };
  await db().insert(bookingWaitlist).values({ organizationId: s.org, userId: s.uid, locationId: picked[0], kind: p.data.kind, startsAt: w.start, endsAt: w.end });
  return { ok: true, data: null };
}

export async function myWaitlist(): Promise<Result<WaitlistDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO_ACCESS };
  const rows = await db().select({ w: bookingWaitlist, l: locations.name }).from(bookingWaitlist).innerJoin(locations, eq(locations.id, bookingWaitlist.locationId))
    .where(and(eq(bookingWaitlist.userId, s.uid), inArray(bookingWaitlist.status, ["waiting", "notified"]), gt(bookingWaitlist.startsAt, new Date()))).orderBy(asc(bookingWaitlist.startsAt)).limit(20);
  return { ok: true, data: rows.map(({ w, l }) => ({ id: w.id, kind: w.kind, locationName: l, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), status: w.status })) };
}

export async function leaveWaitlist(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO_ACCESS };
  await db().update(bookingWaitlist).set({ status: "cancelled" }).where(and(eq(bookingWaitlist.id, id), eq(bookingWaitlist.userId, s.uid)));
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
