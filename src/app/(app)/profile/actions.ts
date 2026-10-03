"use server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

const { users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ProfileDTO = { name: string; email: string; role: string; phone: string; jobTitle: string; company: string; emergencyName: string; emergencyPhone: string };

async function me() {
  const s = await getSession();
  return s && !s.demo && hasDb() ? s : null;
}
const NO = "Sign in with a real account to edit your profile.";

export async function getProfile(): Promise<Result<ProfileDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const [u] = await db().select().from(users).where(and(eq(users.id, s.uid), eq(users.organizationId, s.org)));
  if (!u) return { ok: false, error: "Account not found" };
  return { ok: true, data: { name: u.name, email: u.email, role: u.role, phone: u.phone ?? "", jobTitle: u.jobTitle ?? "", company: u.company ?? "", emergencyName: u.emergencyName ?? "", emergencyPhone: u.emergencyPhone ?? "" } };
}

const phone = z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )");
const profileIn = z.object({
  name: z.string().trim().min(2, "Enter your name").max(160),
  phone, jobTitle: z.string().trim().max(120), company: z.string().trim().max(160),
  emergencyName: z.string().trim().max(120), emergencyPhone: phone,
});
export async function updateProfile(input: z.infer<typeof profileIn>): Promise<Result<null>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const p = profileIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  await db().update(users).set({ name: v.name, phone: v.phone || null, jobTitle: v.jobTitle || null, company: v.company || null, emergencyName: v.emergencyName || null, emergencyPhone: v.emergencyPhone || null })
    .where(and(eq(users.id, s.uid), eq(users.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "profile.update", entity: "user", entityId: s.uid });
  return { ok: true, data: null };
}

const pwIn = z.object({ current: z.string().min(1).max(72), next: z.string().min(8, "New password must be at least 8 characters").max(72) });
export async function changePassword(input: z.infer<typeof pwIn>): Promise<Result<null>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const p = pwIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const [u] = await db().select().from(users).where(and(eq(users.id, s.uid), eq(users.organizationId, s.org)));
  if (!u || !(await bcrypt.compare(p.data.current, u.passwordHash))) return { ok: false, error: "Current password is incorrect" };
  await db().update(users).set({ passwordHash: await bcrypt.hash(p.data.next, 11) }).where(eq(users.id, u.id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "auth.password_change", entity: "user", entityId: u.id });
  return { ok: true, data: null };
}
