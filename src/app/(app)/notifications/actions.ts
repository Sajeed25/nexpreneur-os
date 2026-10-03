"use server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

const { notifications, users } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type NotificationDTO = { id: string; kind: string; title: string; body: string; link: string; read: boolean; at: string };
const MANAGERS = ["super_admin", "owner", "location_manager", "community_manager"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() ? s : null;
}

export async function listNotifications(): Promise<Result<NotificationDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: "Sign in with a real account to see notifications." };
  const rows = await db().select().from(notifications).where(and(eq(notifications.userId, s.uid), eq(notifications.organizationId, s.org))).orderBy(desc(notifications.createdAt)).limit(100);
  return { ok: true, data: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "", read: !!n.readAt, at: n.createdAt.toISOString() })) };
}

/** Polled by the bell icon; deliberately tiny and silent on failure. */
export async function unreadCount(): Promise<number> {
  const s = await ctx();
  if (!s) return 0;
  try {
    const [r] = await db().select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, s.uid), isNull(notifications.readAt)));
    return Number(r.n);
  } catch { return 0; }
}

export async function markRead(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  await db().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, s.uid)));
  return { ok: true, data: null };
}

export async function markAllRead(): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: "Sign in first." };
  await db().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, s.uid), isNull(notifications.readAt)));
  return { ok: true, data: null };
}

const announceIn = z.object({ title: z.string().trim().min(3, "Add a title").max(160), body: z.string().trim().max(500) });
/** Admin announcement to every active user in the organisation. */
export async function sendAnnouncement(input: z.infer<typeof announceIn>): Promise<Result<{ sent: number }>> {
  const s = await ctx();
  if (!s || !can(s.role, "notifications") || !MANAGERS.includes(s.role)) return { ok: false, error: "Only the community team and managers can send announcements." };
  const p = announceIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const people = await db().select({ id: users.id }).from(users).where(and(eq(users.organizationId, s.org), isNull(users.deletedAt))).limit(5000);
  for (let i = 0; i < people.length; i += 500) {
    await db().insert(notifications).values(people.slice(i, i + 500).map((u) => ({ organizationId: s.org, userId: u.id, kind: "announcement", title: p.data.title, body: p.data.body || null, link: null })));
  }
  await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "announcement.send", entity: "notification", entityId: null });
  return { ok: true, data: { sent: people.length } };
}
