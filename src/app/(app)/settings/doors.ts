"use server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { newDoorKey, recentEvents, type DoorEventDTO } from "@/lib/access";

const { doors, locations, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account.";
const OWNERS = ["super_admin", "owner"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && OWNERS.includes(s.role) ? s : null;
}

export type DoorDTO = { id: string; name: string; locationId: string; locationName: string; active: boolean; lastSeenAt: string | null };
export type DoorsData = { doors: DoorDTO[]; locations: { id: string; name: string }[]; events: DoorEventDTO[]; endpoint: string };

export async function getDoors(): Promise<Result<DoorsData>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const locs = await db().select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt))).orderBy(asc(locations.createdAt));
  const rows = await db().select().from(doors).where(eq(doors.organizationId, s.org)).orderBy(asc(doors.createdAt));
  const base = process.env.AUTH_URL ?? "";
  return { ok: true, data: {
    doors: rows.map((d) => ({ id: d.id, name: d.name, locationId: d.locationId, locationName: locs.find((l) => l.id === d.locationId)?.name ?? "", active: d.active, lastSeenAt: d.lastSeenAt?.toISOString() ?? null })),
    locations: locs, events: await recentEvents(s.org, { limit: 30 }), endpoint: `${base}/api/access/verify`,
  } };
}

const addIn = z.object({ name: z.string().trim().min(2, "Give the door a name").max(120), locationId: z.string().uuid() });
/** Creates a door and returns its key. The key is shown once and only a hash is kept, so it can't be looked up again (rotate it instead). */
export async function addDoor(input: z.infer<typeof addIn>): Promise<Result<{ key: string }>> {
  const s = await ctx();
  const p = addIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? (p.error?.issues[0]?.message ?? "Invalid request") : NO };
  const [loc] = await db().select({ id: locations.id }).from(locations).where(and(eq(locations.id, p.data.locationId), eq(locations.organizationId, s.org), isNull(locations.deletedAt)));
  if (!loc) return { ok: false, error: "Pick a location" };
  const { key, hash } = newDoorKey();
  const id = crypto.randomUUID();
  await db().insert(doors).values({ id, organizationId: s.org, locationId: loc.id, name: p.data.name, keyHash: hash });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "door.add", entity: "door", entityId: id });
  return { ok: true, data: { key } };
}

export async function rotateDoorKey(id: string): Promise<Result<{ key: string }>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  const { key, hash } = newDoorKey();
  const r = await db().update(doors).set({ keyHash: hash }).where(and(eq(doors.id, id), eq(doors.organizationId, s.org)));
  if (!(r[0] as { affectedRows?: number }).affectedRows) return { ok: false, error: "Door not found" };
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "door.rotate_key", entity: "door", entityId: id });
  return { ok: true, data: { key } };
}

export async function setDoorActive(id: string, active: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  await db().update(doors).set({ active }).where(and(eq(doors.id, id), eq(doors.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: active ? "door.enable" : "door.disable", entity: "door", entityId: id });
  return { ok: true, data: null };
}
