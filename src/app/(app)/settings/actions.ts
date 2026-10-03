"use server";
import bcrypt from "bcryptjs";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can, ROLES, type Role } from "@/lib/rbac";

const { users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type TeamRow = { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: string | null; isMe: boolean };
export type AuditRow = { id: string; who: string; action: string; at: string };

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "settings") && (s.role === "owner" || s.role === "super_admin") ? s : null;
}
const NO = "Only owners can manage the team.";

export async function listTeam(): Promise<Result<TeamRow[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select().from(users).where(eq(users.organizationId, s.org)).orderBy(users.name).limit(1000);
  return { ok: true, data: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !u.deletedAt, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, isMe: u.id === s.uid })) };
}

// Only a super admin may hand out the super_admin role.
const grantable = (actor: Role): Role[] => (actor === "super_admin" ? [...ROLES] : ROLES.filter((r) => r !== "super_admin"));

export async function setRole(userId: string, role: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!grantable(s.role).includes(role as Role)) return { ok: false, error: "You can't assign that role." };
  if (userId === s.uid) return { ok: false, error: "You can't change your own role. Ask another owner." };
  const [t] = await db().select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org)));
  if (!t) return { ok: false, error: "User not found" };
  if (t.role === "super_admin" && s.role !== "super_admin") return { ok: false, error: "Only a super admin can change a super admin." };
  await db().update(users).set({ role: role as Role }).where(eq(users.id, userId));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `team.role:${t.role}->${role}`, entity: "user", entityId: userId });
  return { ok: true, data: null };
}

export async function setActive(userId: string, active: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (userId === s.uid) return { ok: false, error: "You can't deactivate your own account." };
  const [t] = await db().select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org)));
  if (!t) return { ok: false, error: "User not found" };
  if (t.role === "super_admin" && s.role !== "super_admin") return { ok: false, error: "Only a super admin can change a super admin." };
  await db().update(users).set({ deletedAt: active ? null : new Date() }).where(eq(users.id, userId));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: active ? "team.reactivate" : "team.deactivate", entity: "user", entityId: userId });
  return { ok: true, data: null };
}

const addIn = z.object({
  name: z.string().trim().min(2, "Enter a name").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(190),
  role: z.enum(ROLES), password: z.string().min(8, "Temporary password must be at least 8 characters").max(72),
});
export async function addTeamMember(input: z.infer<typeof addIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = addIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (!grantable(s.role).includes(p.data.role)) return { ok: false, error: "You can't assign that role." };
  const id = crypto.randomUUID();
  try {
    await db().insert(users).values({ id, organizationId: s.org, name: p.data.name, email: p.data.email, passwordHash: await bcrypt.hash(p.data.password, 11), role: p.data.role });
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    return { ok: false, error: code === "ER_DUP_ENTRY" ? "That email already has an account." : "Couldn't add the team member." };
  }
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `team.add:${p.data.role}`, entity: "user", entityId: id });
  return { ok: true, data: null };
}

export async function listAudit(): Promise<Result<AuditRow[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select({ a: auditLogs, u: users }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(eq(auditLogs.organizationId, s.org))).orderBy(desc(auditLogs.createdAt)).limit(60);
  return { ok: true, data: rows.map(({ a, u }) => ({ id: a.id, who: u?.name ?? "System", action: a.action, at: a.createdAt.toISOString() })) };
}
