"use server";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

const { tours, leads, locations, leadActivities, organizations, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to use the CRM.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "crm") ? s : null;
}

export type TourDTO = { id: string; leadId: string; name: string; company: string; phone: string; email: string; location: string; startsAt: string; status: string };
export type ToursData = { upcoming: TourDTO[]; recent: TourDTO[]; link: string | null };

/** Upcoming tours (earliest first), the last two weeks of past ones, and the public booking link to share. */
export async function listTours(): Promise<Result<ToursData>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const now = new Date(), back = new Date(Date.now() - 14 * 86_400_000);
  const rows = await db().select({ t: tours, l: leads, loc: locations.name }).from(tours)
    .innerJoin(leads, eq(leads.id, tours.leadId)).innerJoin(locations, eq(locations.id, tours.locationId))
    .where(and(eq(tours.organizationId, s.org), gte(tours.startsAt, back))).orderBy(asc(tours.startsAt)).limit(200);
  const [o] = await db().select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, s.org));
  const dto = ({ t, l, loc }: (typeof rows)[number]): TourDTO => ({ id: t.id, leadId: l.id, name: l.name, company: l.company ?? "", phone: l.phone ?? "", email: l.email ?? "", location: loc, startsAt: t.startsAt.toISOString(), status: t.status });
  const base = process.env.AUTH_URL ?? "";
  return { ok: true, data: {
    upcoming: rows.filter((r) => r.t.startsAt >= now && r.t.status === "scheduled").map(dto),
    recent: rows.filter((r) => !(r.t.startsAt >= now && r.t.status === "scheduled")).map(dto).reverse(),
    link: o?.slug && base ? `${base}/tour/${o.slug}` : (o?.slug ? `/tour/${o.slug}` : null),
  } };
}

const statusIn = z.object({ id: z.string().uuid(), status: z.enum(["completed", "no_show", "cancelled", "scheduled"]) });
export async function setTourStatus(input: z.infer<typeof statusIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = statusIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO };
  const [t] = await db().select().from(tours).where(and(eq(tours.id, p.data.id), eq(tours.organizationId, s.org)));
  if (!t) return { ok: false, error: "Tour not found" };
  await db().update(tours).set({ status: p.data.status }).where(eq(tours.id, t.id));
  const label = { completed: "was completed", no_show: "was a no-show", cancelled: "was cancelled", scheduled: "was put back on the calendar" }[p.data.status];
  await db().insert(leadActivities).values({ organizationId: s.org, leadId: t.leadId, kind: "note", note: `The tour ${label}.`, createdBy: s.uid });
  // A tour that happened moves the lead along, unless it is already further down the pipeline.
  if (p.data.status === "completed") await db().update(leads).set({ stage: "proposal_sent" }).where(and(eq(leads.id, t.leadId), sql`${leads.stage} in ('new','contacted','tour_scheduled')`));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `tour.${p.data.status}`, entity: "tour", entityId: t.id });
  return { ok: true, data: null };
}
