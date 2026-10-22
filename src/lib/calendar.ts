import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appUrl, sendMail, smtpConfigured } from "@/lib/mailer";
import { bookingConfirmEmail } from "@/lib/emails-growth";
import { fmtIST, rupees } from "@/lib/booking";
import { fmtMinutes } from "@/lib/credit-math";
import { buildIcs, type IcsEvent } from "@/lib/ics";

const { bookings, resources, locations, users, events, eventRegistrations, visitorInvites } = schema;

export const newCalendarToken = () => randomBytes(24).toString("base64url"); // 32 characters

type B = typeof bookings.$inferSelect;
type R = typeof resources.$inferSelect;

const bookingEvent = (b: B, r: R, loc: string | null, base: string | null): IcsEvent => ({
  uid: `booking-${b.id}@nexpreneur`, title: r.name, start: b.startsAt, end: b.endsAt,
  location: loc ?? undefined, description: `${r.name} (${r.capacity} ${r.capacity === 1 ? "person" : "people"})`,
  url: base ? `${base}/bookings` : undefined, status: b.status === "cancelled" ? "CANCELLED" : "CONFIRMED", remindMinutes: 15,
});

/** A member's calendar: their bookings, the events they registered for and visitors they are hosting. */
export async function calendarFor(userId: string, org: string): Promise<IcsEvent[]> {
  const d = db(), base = appUrl();
  const from = new Date(Date.now() - 7 * 86_400_000), to = new Date(Date.now() + 120 * 86_400_000);
  const bks = await d.select({ b: bookings, r: resources, l: locations.name }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(locations, eq(locations.id, bookings.locationId))
    .where(and(eq(bookings.userId, userId), eq(bookings.organizationId, org), eq(bookings.status, "confirmed"), gte(bookings.endsAt, from), lt(bookings.startsAt, to))).orderBy(asc(bookings.startsAt)).limit(400);
  const evs = await d.select({ e: events }).from(eventRegistrations).innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(eventRegistrations.userId, userId), eq(eventRegistrations.status, "registered"), eq(events.organizationId, org), gte(events.endsAt, from), lt(events.startsAt, to))).orderBy(asc(events.startsAt)).limit(100);
  const vis = await d.select().from(visitorInvites).where(and(eq(visitorInvites.hostUserId, userId), eq(visitorInvites.organizationId, org), inArray(visitorInvites.status, ["invited", "checked_in"]), gte(visitorInvites.visitDate, from.toISOString().slice(0, 10))));
  const out: IcsEvent[] = bks.map(({ b, r, l }) => bookingEvent(b, r, l, base));
  for (const { e } of evs) out.push({ uid: `event-${e.id}@nexpreneur`, title: e.title, start: e.startsAt, end: e.endsAt, location: e.venue ?? undefined, description: e.description ?? undefined, url: base ? `${base}/events` : undefined, remindMinutes: 60 });
  for (const v of vis) {
    const start = new Date(`${v.visitDate}T${v.visitTime}:00+05:30`);
    out.push({ uid: `visitor-${v.id}@nexpreneur`, title: `Visitor: ${v.name}`, start, end: new Date(start.getTime() + 3_600_000), description: v.purpose ?? undefined, remindMinutes: 15 });
  }
  return out;
}

/** One calendar file for a few bookings (a recurring series shares one file). */
export async function bookingsIcs(ids: string[], method: "PUBLISH" | "CANCEL" = "PUBLISH") {
  const rows = ids.length ? await db().select({ b: bookings, r: resources, l: locations.name }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(locations, eq(locations.id, bookings.locationId)).where(inArray(bookings.id, ids)).orderBy(asc(bookings.startsAt)) : [];
  const base = appUrl();
  const evs = rows.map(({ b, r, l }) => ({ ...bookingEvent(b, r, l, base), ...(method === "CANCEL" ? { status: "CANCELLED" as const, sequence: 1 } : {}) }));
  return { ics: buildIcs(evs, { method }), rows };
}

/** Emails the booking confirmation with a calendar invite. Best effort: it never throws and never blocks the booking. */
export async function emailBookingConfirmation(userId: string, ids: string[], note: { total: number; creditMinutes: number; creditPasses: number }) {
  if (!smtpConfigured() || !ids.length) return;
  try {
    const { ics, rows } = await bookingsIcs(ids);
    const [u] = await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
    if (!u || !rows.length) return;
    const first = rows[0];
    const when = `${fmtIST(first.b.startsAt.toISOString(), { weekday: "long", day: "numeric", month: "long" })}, ${fmtIST(first.b.startsAt.toISOString(), { hour: "numeric", minute: "2-digit" })} to ${fmtIST(first.b.endsAt.toISOString(), { hour: "numeric", minute: "2-digit" })}${rows.length > 1 ? ` (and ${rows.length - 1} more weekly)` : ""}`;
    const credits = note.creditMinutes || note.creditPasses ? `Plan credits used: ${[note.creditMinutes ? fmtMinutes(note.creditMinutes) + " of room time" : "", note.creditPasses ? `${note.creditPasses} day pass${note.creditPasses > 1 ? "es" : ""}` : ""].filter(Boolean).join(" and ")}` : null;
    const m = bookingConfirmEmail({ name: u.name, space: `${first.r.name}, ${first.l}`, when, totalText: note.total === 0 ? "Nothing to pay." : `Total ${rupees(note.total)} incl. GST, payable at reception.`, creditsText: credits });
    await sendMail(u.email, m.subject, m.text, m.html, [{ filename: "booking.ics", content: Buffer.from(ics), contentType: "text/calendar; charset=UTF-8; method=PUBLISH" }]);
  } catch (e) {
    console.error("booking confirmation email failed", e);
  }
}
