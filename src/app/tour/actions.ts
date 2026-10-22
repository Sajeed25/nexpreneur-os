"use server";
import { headers } from "next/headers";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { throttled } from "@/lib/auth";
import { istToDate, fmtIST } from "@/lib/booking";
import { TOUR_CAPACITY, TOUR_SLOTS, tourDays, tourEnd, tourSlotProblem } from "@/lib/tour-math";
import { tourToken, verifyTourToken } from "@/lib/tours";
import { buildIcs } from "@/lib/ics";
import { appUrl, sendMail, smtpConfigured } from "@/lib/mailer";
import { tourConfirmEmail } from "@/lib/emails-growth";
import { notify } from "@/lib/notify";

const { organizations, locations, leads, leadActivities, tours, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NOT_READY = "Tour booking isn't available right now.";

async function orgBySlug(slug: string) {
  if (!hasDb() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const [o] = await db().select().from(organizations).where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)));
  return o ?? null;
}

export type TourPage = { org: string; locations: { id: string; name: string; city: string; address: string }[]; days: string[]; slots: string[] };

/** What the public booking page needs. Nothing private: names of the spaces and the times that can be picked. */
export async function loadTourPage(slug: string): Promise<Result<TourPage>> {
  const o = await orgBySlug(slug);
  if (!o) return { ok: false, error: NOT_READY };
  const locs = await db().select().from(locations).where(and(eq(locations.organizationId, o.id), isNull(locations.deletedAt))).orderBy(locations.createdAt);
  return { ok: true, data: { org: o.name, locations: locs.map((l) => ({ id: l.id, name: l.name, city: l.city ?? "", address: l.address ?? "" })), days: tourDays(), slots: TOUR_SLOTS } };
}

/** How many places are left in each slot of a day at a location. */
export async function loadSlots(slug: string, locationId: string, date: string): Promise<Result<{ time: string; left: number; bookable: boolean }[]>> {
  const o = await orgBySlug(slug);
  if (!o || !z.string().uuid().safeParse(locationId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: NOT_READY };
  const from = istToDate(date, "00:00"), to = new Date(from.getTime() + 86_400_000);
  const rows = await db().select({ at: tours.startsAt }).from(tours).where(and(eq(tours.organizationId, o.id), eq(tours.locationId, locationId), eq(tours.status, "scheduled"), sql`${tours.startsAt} >= ${from} and ${tours.startsAt} < ${to}`));
  return { ok: true, data: TOUR_SLOTS.map((time) => {
    const t = istToDate(date, time).getTime();
    const used = rows.filter((r) => r.at.getTime() === t).length;
    return { time, left: Math.max(0, TOUR_CAPACITY - used), bookable: !tourSlotProblem(date, time) && used < TOUR_CAPACITY };
  }) };
}

const clientIp = async () => ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();

const visitorIn = z.object({
  slug: z.string().max(80), name: z.string().trim().min(2, "Enter your name").max(160),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(190),
  company: z.string().trim().max(160), requirements: z.string().trim().max(1000),
  /** A hidden field real people never fill in. */
  website: z.string().max(200).optional(),
});
const tourIn = visitorIn.extend({ locationId: z.string().uuid(), date: z.string(), time: z.string() });

/** Finds the lead for this email (still open) or makes one, so a prospect who books twice isn't duplicated. */
async function leadFor(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], org: string, v: z.infer<typeof visitorIn>, stage: "new" | "tour_scheduled") {
  const [existing] = await tx.select().from(leads).where(and(eq(leads.organizationId, org), eq(leads.email, v.email), inArray(leads.stage, ["new", "contacted", "tour_scheduled", "proposal_sent", "negotiation"]))).limit(1);
  if (existing) {
    if (stage === "tour_scheduled" && (existing.stage === "new" || existing.stage === "contacted")) await tx.update(leads).set({ stage }).where(eq(leads.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await tx.insert(leads).values({ id, organizationId: org, name: v.name, company: v.company || null, phone: v.phone || null, email: v.email, requirements: v.requirements || null, stage });
  return id;
}

async function teamIds(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], org: string) {
  return (await tx.select({ id: users.id }).from(users).where(and(eq(users.organizationId, org), inArray(users.role, ["owner", "super_admin", "location_manager"]), isNull(users.deletedAt)))).map((u) => u.id);
}

export type Booked = { when: string; location: string; token: string; emailed: boolean };

export async function bookTour(input: z.infer<typeof tourIn>): Promise<Result<Booked>> {
  const p = tourIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check your details" };
  const v = p.data;
  if (v.website) return { ok: true, data: { when: "", location: "", token: "", emailed: false } }; // a bot filled the hidden field: pretend it worked
  if (throttled(`tour:${await clientIp()}`, 6, 3_600_000) || throttled(`tour:${v.email}`, 3, 86_400_000)) return { ok: false, error: "Too many requests. Please try again later or call us." };
  const o = await orgBySlug(v.slug);
  if (!o) return { ok: false, error: NOT_READY };
  const problem = tourSlotProblem(v.date, v.time);
  if (problem) return { ok: false, error: problem };
  try {
    const out = await db().transaction(async (tx) => {
      // Lock the location so two people can't take the last place in a slot at the same moment.
      const [loc] = await tx.select().from(locations).where(and(eq(locations.id, v.locationId), eq(locations.organizationId, o.id), isNull(locations.deletedAt))).for("update");
      if (!loc) throw new Error("LOCATION");
      const start = istToDate(v.date, v.time);
      const [c] = await tx.select({ n: sql<number>`count(*)` }).from(tours).where(and(eq(tours.locationId, loc.id), eq(tours.status, "scheduled"), eq(tours.startsAt, start)));
      if (Number(c.n) >= TOUR_CAPACITY) throw new Error("FULL");
      const leadId = await leadFor(tx, o.id, v, "tour_scheduled");
      const id = crypto.randomUUID();
      await tx.insert(tours).values({ id, organizationId: o.id, leadId, locationId: loc.id, startsAt: start });
      const when = `${fmtIST(start.toISOString(), { weekday: "long", day: "numeric", month: "long" })}, ${fmtIST(start.toISOString(), { hour: "numeric", minute: "2-digit" })}`;
      await tx.insert(leadActivities).values({ organizationId: o.id, leadId, kind: "note", note: `Booked a tour at ${loc.name} for ${when} (website).` });
      for (const uid of await teamIds(tx, o.id)) await notify(tx, { org: o.id, userId: uid, kind: "tour", title: `New tour booked: ${v.name}`, body: `${when} · ${loc.name}`, link: "/crm" });
      return { id, when, loc, start };
    });
    const token = tourToken(out.id);
    let emailed = false;
    if (smtpConfigured()) {
      try {
        const base = appUrl();
        const m = tourConfirmEmail({ name: v.name, org: o.name, location: out.loc.name, address: out.loc.address, when: out.when, cancelUrl: base ? `${base}/tour/cancel?token=${token}` : null, ics: true });
        const ics = buildIcs([{ uid: `tour-${out.id}@nexpreneur`, title: `Tour of ${o.name} ${out.loc.name}`, start: out.start, end: tourEnd(v.date, v.time), location: [out.loc.name, out.loc.address].filter(Boolean).join(", "), description: "A guided tour of the space.", remindMinutes: 60 }]);
        await sendMail(v.email, m.subject, m.text, m.html, [{ filename: "tour.ics", content: Buffer.from(ics), contentType: "text/calendar; charset=UTF-8; method=PUBLISH" }]);
        emailed = true;
      } catch (e) { console.error("tour email failed", e); }
    }
    return { ok: true, data: { when: out.when, location: out.loc.name, token, emailed } };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "FULL") return { ok: false, error: "Sorry, that time was just taken. Please pick another." };
    if (m === "LOCATION") return { ok: false, error: "Please pick a location." };
    console.error("bookTour failed", e);
    return { ok: false, error: "Couldn't book your tour. Please try again." };
  }
}

const contactIn = visitorIn;
/** For people who would rather be contacted than pick a time: becomes a new lead for the team. */
export async function requestContact(input: z.infer<typeof contactIn>): Promise<Result<null>> {
  const p = contactIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check your details" };
  const v = p.data;
  if (v.website) return { ok: true, data: null };
  if (throttled(`tour:${await clientIp()}`, 6, 3_600_000) || throttled(`tour:${v.email}`, 3, 86_400_000)) return { ok: false, error: "Too many requests. Please try again later or call us." };
  const o = await orgBySlug(v.slug);
  if (!o) return { ok: false, error: NOT_READY };
  await db().transaction(async (tx) => {
    const leadId = await leadFor(tx, o.id, v, "new");
    await tx.insert(leadActivities).values({ organizationId: o.id, leadId, kind: "note", note: `Asked to be contacted (website).${v.requirements ? ` "${v.requirements.slice(0, 300)}"` : ""}` });
    for (const uid of await teamIds(tx, o.id)) await notify(tx, { org: o.id, userId: uid, kind: "tour", title: `New enquiry: ${v.name}`, body: v.requirements.slice(0, 120) || "Asked to be contacted", link: "/crm" });
    await tx.insert(auditLogs).values({ organizationId: o.id, actorId: null, action: "lead.web_enquiry", entity: "lead", entityId: leadId });
  });
  return { ok: true, data: null };
}

export type TourView = { id: string; when: string; location: string; status: string; org: string; cancellable: boolean };
export async function getTourByToken(token: string): Promise<Result<TourView>> {
  const id = verifyTourToken(token);
  if (!id || !hasDb()) return { ok: false, error: "This link isn't valid." };
  const [row] = await db().select({ t: tours, l: locations, o: organizations }).from(tours).innerJoin(locations, eq(locations.id, tours.locationId)).innerJoin(organizations, eq(organizations.id, tours.organizationId)).where(eq(tours.id, id));
  if (!row) return { ok: false, error: "We couldn't find that tour." };
  const when = `${fmtIST(row.t.startsAt.toISOString(), { weekday: "long", day: "numeric", month: "long" })}, ${fmtIST(row.t.startsAt.toISOString(), { hour: "numeric", minute: "2-digit" })}`;
  return { ok: true, data: { id, when, location: row.l.name, status: row.t.status, org: row.o.name, cancellable: row.t.status === "scheduled" && row.t.startsAt.getTime() > Date.now() } };
}

export async function cancelTourByToken(token: string): Promise<Result<null>> {
  const id = verifyTourToken(token);
  if (!id || !hasDb()) return { ok: false, error: "This link isn't valid." };
  const [t] = await db().select().from(tours).where(eq(tours.id, id));
  if (!t) return { ok: false, error: "We couldn't find that tour." };
  if (t.status !== "scheduled" || t.startsAt.getTime() <= Date.now()) return { ok: false, error: "This tour can't be cancelled any more." };
  await db().transaction(async (tx) => {
    await tx.update(tours).set({ status: "cancelled" }).where(eq(tours.id, id));
    await tx.insert(leadActivities).values({ organizationId: t.organizationId, leadId: t.leadId, kind: "note", note: "The visitor cancelled their tour." });
    for (const uid of await teamIds(tx, t.organizationId)) await notify(tx, { org: t.organizationId, userId: uid, kind: "tour", title: "A tour was cancelled", body: fmtIST(t.startsAt.toISOString(), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), link: "/crm" });
  });
  return { ok: true, data: null };
}
