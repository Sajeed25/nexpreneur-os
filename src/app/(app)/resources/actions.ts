"use server";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isManager, toPaise } from "@/lib/billing";
import { KINDS } from "@/lib/booking";

const { resources, locations, bookings, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ResourceRow = {
  id: string; name: string; kind: string; capacity: number; status: string; locationId: string; locationName: string;
  hourlyPaise: number | null; dailyPaise: number | null; upcoming: number;
};
const NO = "Sign in with a real account to manage resources.";
const KIND_IDS = KINDS.map((k) => k.id) as [string, ...string[]];
const STATUSES = ["available", "reserved", "maintenance", "unavailable"] as const;

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "resources") ? s : null;
}

export async function listResourceRows(): Promise<Result<{ rows: ResourceRow[]; locations: { id: string; name: string }[]; canEdit: boolean }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const d = db();
  const [locs, rs, up] = await Promise.all([
    d.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt))).orderBy(asc(locations.createdAt)),
    d.select().from(resources).where(and(eq(resources.organizationId, s.org), isNull(resources.deletedAt))).orderBy(asc(resources.kind), asc(resources.name)).limit(1000),
    d.select({ id: bookings.resourceId, n: sql<number>`count(*)` }).from(bookings).where(and(eq(bookings.organizationId, s.org), inArray(bookings.status, ["confirmed", "pending"]), gt(bookings.endsAt, new Date()))).groupBy(bookings.resourceId),
  ]);
  return { ok: true, data: {
    locations: locs, canEdit: isManager(s.role),
    rows: rs.map((r) => ({ id: r.id, name: r.name, kind: r.kind, capacity: r.capacity, status: r.status, locationId: r.locationId, locationName: locs.find((l) => l.id === r.locationId)?.name ?? "",
      hourlyPaise: r.hourlyPricePaise, dailyPaise: r.dailyPricePaise, upcoming: Number(up.find((u) => u.id === r.id)?.n ?? 0) })),
  } };
}

const saveIn = z.object({
  locationId: z.string().uuid(), name: z.string().trim().min(1, "Enter a name").max(160), kind: z.enum(KIND_IDS),
  capacity: z.number().int().min(1).max(5000), hourly: z.number().min(0).max(1_000_000).optional(), daily: z.number().min(0).max(1_000_000).optional(),
  status: z.enum(STATUSES), count: z.number().int().min(1).max(50).optional(),
});
const DAILY_KINDS = ["hot_desk", "dedicated_desk", "private_office"];
const HOURLY_KINDS = ["meeting_room", "phone_booth", "event_space"];

/** Adds one resource, or several in one go ("Hot Desk 01..10") when count > 1, or edits an existing one. Prices are in rupees before GST. */
export async function saveResource(id: string | null, input: z.infer<typeof saveIn>): Promise<Result<{ created: number }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!isManager(s.role)) return { ok: false, error: "You don't have permission to change resources." };
  const p = saveIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  if (DAILY_KINDS.includes(v.kind) && !(v.daily && v.daily > 0)) return { ok: false, error: "Enter a price per day for this kind of space." };
  if (HOURLY_KINDS.includes(v.kind) && !(v.hourly && v.hourly > 0)) return { ok: false, error: "Enter a price per hour for this kind of space." };
  if (!DAILY_KINDS.includes(v.kind) && !HOURLY_KINDS.includes(v.kind) && !(v.hourly || v.daily)) return { ok: false, error: "Enter a price per hour or per day." };
  const [loc] = await db().select({ id: locations.id }).from(locations).where(and(eq(locations.id, v.locationId), eq(locations.organizationId, s.org), isNull(locations.deletedAt)));
  if (!loc) return { ok: false, error: "Choose a location." };

  const fields = { locationId: loc.id, kind: v.kind as "hot_desk", capacity: v.capacity, status: v.status, hourlyPricePaise: v.hourly ? toPaise(v.hourly) : null, dailyPricePaise: v.daily ? toPaise(v.daily) : null };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
    const r = await db().update(resources).set({ name: v.name, ...fields }).where(and(eq(resources.id, id), eq(resources.organizationId, s.org)));
    if (!(r[0] as { affectedRows?: number }).affectedRows) return { ok: false, error: "Resource not found" };
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "resource.update", entity: "resource", entityId: id });
    return { ok: true, data: { created: 0 } };
  }
  const n = v.count ?? 1;
  const names = n === 1 ? [v.name] : Array.from({ length: n }, (_, i) => `${v.name} ${String(i + 1).padStart(2, "0")}`);
  await db().insert(resources).values(names.map((name) => ({ organizationId: s.org, name, ...fields })));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `resource.add:${n}`, entity: "resource", entityId: null });
  return { ok: true, data: { created: n } };
}

export async function setResourceStatus(id: string, status: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success || !(STATUSES as readonly string[]).includes(status)) return { ok: false, error: s ? "Invalid request" : NO };
  if (!isManager(s.role)) return { ok: false, error: "You don't have permission to change resources." };
  await db().update(resources).set({ status: status as "available" }).where(and(eq(resources.id, id), eq(resources.organizationId, s.org)));
  return { ok: true, data: null };
}

/** Archiving hides a resource everywhere. Resources with upcoming bookings are protected so nobody turns up to a missing room. */
export async function archiveResource(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!isManager(s.role)) return { ok: false, error: "You don't have permission to change resources." };
  const [u] = await db().select({ n: sql<number>`count(*)` }).from(bookings).where(and(eq(bookings.resourceId, id), eq(bookings.organizationId, s.org), inArray(bookings.status, ["confirmed", "pending"]), gt(bookings.endsAt, new Date())));
  if (Number(u.n) > 0) return { ok: false, error: `It has ${u.n} upcoming booking${Number(u.n) > 1 ? "s" : ""}. Cancel them first, or mark it as under maintenance instead.` };
  await db().update(resources).set({ deletedAt: new Date() }).where(and(eq(resources.id, id), eq(resources.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "resource.archive", entity: "resource", entityId: id });
  return { ok: true, data: null };
}
