"use server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

const { locations, resources, memberships, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type LocationRow = { id: string; name: string; city: string; resources: number; activeMembers: number };
const NO = "Sign in with a real account to manage locations.";
const OWNERS = ["super_admin", "owner"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "locations") ? s : null;
}

export async function listLocationRows(): Promise<Result<{ rows: LocationRow[]; canEdit: boolean }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const d = db();
  const [locs, rs, ms] = await Promise.all([
    d.select().from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt))).orderBy(asc(locations.createdAt)),
    d.select({ id: resources.locationId, n: sql<number>`count(*)` }).from(resources).where(and(eq(resources.organizationId, s.org), isNull(resources.deletedAt))).groupBy(resources.locationId),
    d.select({ id: memberships.locationId, n: sql<number>`count(distinct ${memberships.userId})` }).from(memberships).where(and(eq(memberships.organizationId, s.org), eq(memberships.status, "active"))).groupBy(memberships.locationId),
  ]);
  return { ok: true, data: { canEdit: OWNERS.includes(s.role), rows: locs.map((l) => ({ id: l.id, name: l.name, city: l.city ?? "", resources: Number(rs.find((r) => r.id === l.id)?.n ?? 0), activeMembers: Number(ms.find((m) => m.id === l.id)?.n ?? 0) })) } };
}

const locIn = z.object({ name: z.string().trim().min(2, "Enter a name").max(120), city: z.string().trim().max(120) });

export async function saveLocation(id: string | null, input: z.infer<typeof locIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!OWNERS.includes(s.role)) return { ok: false, error: "Only owners can add or rename locations." };
  const p = locIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
    await db().update(locations).set({ name: p.data.name, city: p.data.city || null }).where(and(eq(locations.id, id), eq(locations.organizationId, s.org)));
  } else {
    const nid = crypto.randomUUID();
    await db().insert(locations).values({ id: nid, organizationId: s.org, name: p.data.name, city: p.data.city || null });
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "location.add", entity: "location", entityId: nid });
  }
  return { ok: true, data: null };
}

/** A location can only be archived once it has no resources and no active members, so nothing is left pointing at it. */
export async function archiveLocation(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!OWNERS.includes(s.role)) return { ok: false, error: "Only owners can archive locations." };
  const list = await listLocationRows();
  const row = list.ok ? list.data.rows.find((r) => r.id === id) : undefined;
  if (!row) return { ok: false, error: "Location not found" };
  if (list.ok && list.data.rows.length <= 1) return { ok: false, error: "You need at least one location." };
  if (row.resources > 0) return { ok: false, error: `It still has ${row.resources} resources. Archive or move them first.` };
  if (row.activeMembers > 0) return { ok: false, error: `It still has ${row.activeMembers} active members.` };
  await db().update(locations).set({ deletedAt: new Date() }).where(and(eq(locations.id, id), eq(locations.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "location.archive", entity: "location", entityId: id });
  return { ok: true, data: null };
}
