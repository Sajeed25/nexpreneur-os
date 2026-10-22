import "server-only";
import { and, asc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tx } from "@/lib/payments-server";
import { notify } from "@/lib/notify";
import { kindLabel } from "@/lib/booking";

const { bookingWaitlist, bookings, resources } = schema;
type Exec = ReturnType<typeof db> | Tx;

const IST_MS = 5.5 * 3_600_000;
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istTime = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(11, 16);

/** How many people we tell at once about a freed slot. First come, first served: the rest hear about the next one. */
export const OFFER_TO = 3;

/**
 * A booking was cancelled: tell the first few people waiting for that kind of space (at that location) whose time
 * now fits. Returns how many were notified.
 */
export async function offerFreedSlot(exec: Exec, freed: { org: string; resourceId: string; locationId: string }): Promise<number> {
  const [res] = await exec.select().from(resources).where(eq(resources.id, freed.resourceId));
  if (!res || res.status !== "available") return 0;
  const waiting = await exec.select().from(bookingWaitlist).where(and(
    eq(bookingWaitlist.organizationId, freed.org), eq(bookingWaitlist.locationId, freed.locationId), eq(bookingWaitlist.kind, res.kind),
    eq(bookingWaitlist.status, "waiting"), gt(bookingWaitlist.startsAt, new Date()),
  )).orderBy(asc(bookingWaitlist.createdAt)).limit(25);
  let told = 0;
  for (const w of waiting) {
    if (told >= OFFER_TO) break;
    const clash = await exec.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.resourceId, res.id), inArray(bookings.status, ["confirmed", "pending"]), lt(bookings.startsAt, w.endsAt), gt(bookings.endsAt, w.startsAt),
    )).limit(1);
    if (clash.length) continue;
    const claim = await exec.update(bookingWaitlist).set({ status: "notified", notifiedAt: new Date() }).where(and(eq(bookingWaitlist.id, w.id), eq(bookingWaitlist.status, "waiting")));
    if (!(claim[0] as { affectedRows?: number }).affectedRows) continue;
    const q = new URLSearchParams({ kind: w.kind, date: istDate(w.startsAt), start: istTime(w.startsAt), end: istTime(w.endsAt) });
    await notify(exec, {
      org: freed.org, userId: w.userId, kind: "booking", title: `A ${kindLabel(w.kind).toLowerCase()} just opened up`,
      body: `${istDate(w.startsAt)}, ${istTime(w.startsAt)} to ${istTime(w.endsAt)}. Book it before someone else does.`, link: `/bookings/new?${q}`,
    });
    told++;
  }
  return told;
}

/** Waitlist entries whose time has come and gone are closed. */
export async function expireWaitlist() {
  const r = await db().update(bookingWaitlist).set({ status: "expired" })
    .where(and(or(eq(bookingWaitlist.status, "waiting"), eq(bookingWaitlist.status, "notified")), lt(bookingWaitlist.startsAt, new Date())));
  return (r[0] as { affectedRows?: number }).affectedRows ?? 0;
}
