"use server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { throttled } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { beginSetup, checkChallenge, confirmSetup, disableTwoFactor, regenerateRecovery, twoFactorStatus, type TwoFactorStatus } from "@/lib/twofactor";

const { users, organizations } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to manage security.";

async function me() {
  const s = await getSession();
  return s && !s.demo && hasDb() ? s : null;
}

export type SecurityDTO = TwoFactorStatus & { requiredByPolicy: boolean; email: string };

export async function getSecurity(): Promise<Result<SecurityDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const [o] = await db().select({ r: organizations.require2faRoles }).from(organizations).where(eq(organizations.id, s.org));
  return { ok: true, data: { ...(await twoFactorStatus(s.uid)), requiredByPolicy: !!o?.r && o.r.split(",").includes(s.role), email: s.email } };
}

export async function startTotpSetup(): Promise<Result<{ secret: string; qr: string }>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  if ((await twoFactorStatus(s.uid)).enabled) return { ok: false, error: "Two-factor is already on. Turn it off first if you want to set it up again." };
  const r = await beginSetup(s.uid, s.email);
  return { ok: true, data: { secret: r.secret, qr: r.qr } };
}

/** The person types the first code from their app. Right code: two-factor is on, and the recovery codes are shown (once). */
export async function confirmTotpSetup(code: string): Promise<Result<{ codes: string[] }>> {
  const s = await me();
  if (!s || typeof code !== "string") return { ok: false, error: NO };
  if (throttled(`2fa-setup:${s.uid}`, 8, 10 * 60_000)) return { ok: false, error: "Too many tries. Wait a few minutes." };
  const codes = await confirmSetup(s.uid, s.org, code);
  if (!codes) return { ok: false, error: "That code didn't match. Check the time on your phone and try the next code." };
  await notify(db(), { org: s.org, userId: s.uid, kind: "security", title: "Two-factor sign-in is on", body: "You'll enter a code from your authenticator app when you sign in.", link: "/profile/security" });
  return { ok: true, data: { codes } };
}

/** Turning it off needs the password. If the organisation requires two-factor for this role, it can't be turned off. */
export async function disableTotp(password: string): Promise<Result<null>> {
  const s = await me();
  if (!s || typeof password !== "string") return { ok: false, error: NO };
  const sec = await getSecurity();
  if (sec.ok && sec.data.requiredByPolicy) return { ok: false, error: "Your organisation requires two-factor sign-in for your role, so it can't be turned off." };
  if (throttled(`2fa-off:${s.uid}`, 5, 10 * 60_000)) return { ok: false, error: "Too many tries. Wait a few minutes." };
  const [u] = await db().select({ h: users.passwordHash }).from(users).where(and(eq(users.id, s.uid), eq(users.organizationId, s.org)));
  if (!u || !(await bcrypt.compare(password, u.h))) return { ok: false, error: "That password isn't right." };
  await disableTwoFactor(s.uid, s.org, s.uid);
  await notify(db(), { org: s.org, userId: s.uid, kind: "security", title: "Two-factor sign-in was turned off", body: "If this wasn't you, change your password now.", link: "/profile" });
  return { ok: true, data: null };
}

/** New recovery codes (the old ones stop working). Needs a current code from the app, so a stolen session can't mint them. */
export async function newRecoveryCodesFor(code: string): Promise<Result<{ codes: string[] }>> {
  const s = await me();
  const c = z.string().trim().regex(/^\d{3}\s?\d{3}$/).safeParse(code);
  if (!s || !c.success) return { ok: false, error: s ? "Enter the 6-digit code from your app." : NO };
  if (throttled(`2fa-regen:${s.uid}`, 5, 10 * 60_000)) return { ok: false, error: "Too many tries. Wait a few minutes." };
  if ((await checkChallenge(s.uid, c.data)) !== "totp") return { ok: false, error: "That code didn't match." };
  return { ok: true, data: { codes: await regenerateRecovery(s.uid) } };
}
