"use server";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toPaise } from "@/lib/billing";
import { istToDate, todayIST } from "@/lib/booking";
import { issueInvoice } from "@/lib/invoicing";
import { notify } from "@/lib/notify";

const { events, eventRegistrations, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type EventDTO = {
  id: string; title: string; description: string; startsAt: string; endsAt: string; venue: string; capacity: number;
  pricePaise: number; organizer: string; published: boolean; registered: number; mine: boolean; invoiceId: string | null; imageId: string | null;
};
const MANAGE = ["super_admin", "owner", "location_manager", "community_manager"];
const NO = "Sign in with a real account to use events.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "events") ? s : null;
}

export async function listEvents(): Promise<Result<EventDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const manage = MANAGE.includes(s.role);
  // Show events from yesterday onwards so today's events stay visible.
  const since = new Date(Date.now() - 86_400_000);
  const rows = await db().select().from(events)
    .where(and(eq(events.organizationId, s.org), gte(events.endsAt, since), manage ? undefined : eq(events.published, true)))
    .orderBy(asc(events.startsAt)).limit(200);
  const regs = await db().select({ eventId: eventRegistrations.eventId, userId: eventRegistrations.userId, invoiceId: eventRegistrations.invoiceId })
    .from(eventRegistrations).innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(events.organizationId, s.org), eq(eventRegistrations.status, "registered")));
  return { ok: true, data: rows.map((e) => {
    const r = regs.filter((x) => x.eventId === e.id);
    const mine = r.find((x) => x.userId === s.uid);
    return { id: e.id, title: e.title, description: e.description ?? "", startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), venue: e.venue ?? "", capacity: e.capacity,
      pricePaise: e.pricePaise, organizer: e.organizer ?? "", published: e.published, registered: r.length, mine: !!mine, invoiceId: mine?.invoiceId ?? null, imageId: e.imageId };
  }) };
}

const eventIn = z.object({
  title: z.string().trim().min(3, "Add a title").max(160), description: z.string().trim().max(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/),
  venue: z.string().trim().max(160), capacity: z.number().int().min(1).max(5000), price: z.number().min(0).max(1_000_000), organizer: z.string().trim().max(120),
  publish: z.boolean(), imageId: z.string().uuid().optional(),
});
export async function createEvent(input: z.infer<typeof eventIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!MANAGE.includes(s.role)) return { ok: false, error: "You don't have permission to create events." };
  const p = eventIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  const startsAt = istToDate(v.date, v.start), endsAt = istToDate(v.date, v.end);
  if (isNaN(startsAt.getTime()) || endsAt <= startsAt) return { ok: false, error: "End time must be after start time" };
  if (v.date < todayIST()) return { ok: false, error: "The event date is in the past" };
  if (v.imageId) {
    const [img] = await db().select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.id, v.imageId), eq(schema.images.organizationId, s.org)));
    if (!img) return { ok: false, error: "That image wasn't found. Upload it again." };
  }
  const id = crypto.randomUUID();
  await db().insert(events).values({ id, imageId: v.imageId ?? null, organizationId: s.org, title: v.title, description: v.description || null, startsAt, endsAt, venue: v.venue || null, capacity: v.capacity, pricePaise: toPaise(v.price), organizer: v.organizer || null, published: v.publish });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "event.create", entity: "event", entityId: id });
  return { ok: true, data: null };
}

export async function setPublished(id: string, published: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!MANAGE.includes(s.role)) return { ok: false, error: "You don't have permission to do that." };
  await db().update(events).set({ published }).where(and(eq(events.id, id), eq(events.organizationId, s.org)));
  return { ok: true, data: null };
}

/** Registers the signed-in member. Capacity is checked under a row lock; paid events also issue the ticket invoice. */
export async function registerForEvent(id: string): Promise<Result<{ invoiceId: string | null }>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  try {
    return await db().transaction(async (tx) => {
      const [e] = await tx.select().from(events).where(and(eq(events.id, id), eq(events.organizationId, s.org))).for("update");
      if (!e || (!e.published && !MANAGE.includes(s.role))) return { ok: false as const, error: "Event not found" };
      if (e.endsAt < new Date()) return { ok: false as const, error: "This event has ended" };
      const [prev] = await tx.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, e.id), eq(eventRegistrations.userId, s.uid)));
      if (prev?.status === "registered") return { ok: false as const, error: "You're already registered" };
      const [c] = await tx.select({ n: sql<number>`count(*)` }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, e.id), eq(eventRegistrations.status, "registered")));
      if (Number(c.n) >= e.capacity) return { ok: false as const, error: "Sorry, this event is full" };
      let invoiceId: string | null = null;
      if (e.pricePaise > 0) {
        invoiceId = await issueInvoice(tx, s, s.uid, [{ description: `Event ticket: ${e.title}`, qty: 1, unitPaise: e.pricePaise, taxPct: 18, hsnSac: "999699" }], todayIST(), false, null, 3);
      }
      if (prev) await tx.update(eventRegistrations).set({ status: "registered", invoiceId }).where(eq(eventRegistrations.id, prev.id));
      else await tx.insert(eventRegistrations).values({ eventId: e.id, userId: s.uid, invoiceId });
      await notify(tx, { org: s.org, userId: s.uid, kind: "event", title: `You're registered: ${e.title}`, link: "/events" });
      return { ok: true as const, data: { invoiceId } };
    });
  } catch (e) {
    console.error("registerForEvent failed", e);
    return { ok: false, error: "Couldn't register. Please try again." };
  }
}

export async function cancelRegistration(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  const [e] = await db().select().from(events).where(and(eq(events.id, id), eq(events.organizationId, s.org)));
  if (!e) return { ok: false, error: "Event not found" };
  if (e.startsAt < new Date()) return { ok: false, error: "This event has already started" };
  const [r] = await db().select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.userId, s.uid), eq(eventRegistrations.status, "registered")));
  if (!r) return { ok: false, error: "You're not registered" };
  await db().update(eventRegistrations).set({ status: "cancelled" }).where(eq(eventRegistrations.id, r.id));
  return { ok: true, data: null };
}

export async function listAttendees(id: string): Promise<Result<{ name: string; email: string }[]>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!MANAGE.includes(s.role)) return { ok: false, error: "You don't have permission to see attendees." };
  const rows = await db().select({ name: users.name, email: users.email }).from(eventRegistrations)
    .innerJoin(users, eq(users.id, eventRegistrations.userId)).innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(eventRegistrations.eventId, id), eq(events.organizationId, s.org), eq(eventRegistrations.status, "registered"))).orderBy(users.name);
  return { ok: true, data: rows };
}
