"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COOKIE, authConfigured, cookieOptions, signSession, throttled } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";
import { isRole, type Role } from "@/lib/rbac";
import { HOME } from "@/lib/home";

export type FormState = { error?: string; ok?: string };

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(190);
const password = z.string().min(8, "Password must be at least 8 characters").max(72);
const CONFIG_ERR = "Server setup incomplete: AUTH_SECRET must be a random string of 16+ characters. Set it in the host's environment variables and redeploy.";
const BAD_LOGIN = "Incorrect email or password";

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

/** Short, non-sensitive tag (error name/code only) so a failure can be diagnosed from the screen. */
function tag(e: unknown) {
  const o = e as { code?: string; cause?: { code?: string }; name?: string };
  return o?.code ?? o?.cause?.code ?? o?.name ?? "unknown";
}

async function start(s: { uid: string; org: string; name: string; email: string; role: Role; demo?: boolean }): Promise<never> {
  (await cookies()).set(COOKIE, await signSession(s), cookieOptions);
  redirect(HOME[s.role]);
}

const TWO_FA_COOKIE = "nx_2fa";

/** Signs in, or - when the person has two-factor on - holds them at the code screen. The password (or link) alone is not enough. */
async function startOrChallenge(s: { uid: string; org: string; name: string; email: string; role: Role; totp?: boolean }): Promise<never> {
  if (!s.totp) return start(s);
  const { signBlob } = await import("@/lib/oauth");
  const { totp: _t, ...who } = s; void _t;
  (await cookies()).set(TWO_FA_COOKIE, signBlob({ purpose: "2fa", ...who }, 5 * 60_000), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  redirect("/login/2fa");
}

/** The code screen: an authenticator code, or a one-time recovery code. Five tries, then the person has to start again. */
export async function verifyTwoFactor(_: FormState, fd: FormData): Promise<FormState> {
  const code = z.string().trim().min(6).max(20).safeParse(fd.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code from your authenticator app." };
  const { verifyBlob } = await import("@/lib/oauth");
  const jar = await cookies();
  const blob = verifyBlob<{ purpose: string; uid: string; org: string; name: string; email: string; role: Role }>(jar.get(TWO_FA_COOKIE)?.value);
  if (!blob || blob.purpose !== "2fa" || !isRole(blob.role)) return { error: "That sign-in expired. Please sign in again." };
  if (throttled(`2fa:${blob.uid}`, 6, 10 * 60_000) || throttled(`2fa-ip:${await clientKey()}`, 20, 10 * 60_000)) return { error: "Too many attempts. Wait a few minutes, then sign in again." };
  let how: "totp" | "recovery" | null = null;
  try {
    how = await (await import("@/lib/twofactor")).checkChallenge(blob.uid, code.data);
  } catch (e) {
    console.error("2fa check failed", e);
    return { error: `Couldn't check the code (code: ${tag(e)}). Please try again.` };
  }
  if (!how) return { error: "That code didn't work. Check the time on your phone, or use a recovery code." };
  jar.delete(TWO_FA_COOKIE);
  try {
    const { db, schema } = await import("@/lib/db");
    await db().insert(schema.auditLogs).values({ organizationId: blob.org, actorId: blob.uid, action: `auth.2fa_login:${how}`, entity: "user", entityId: blob.uid });
  } catch (e) { console.error("2fa audit failed", e); }
  return start({ uid: blob.uid, org: blob.org, name: blob.name, email: blob.email, role: blob.role });
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const base = z.object({ email, password });

  // No database configured yet: demo mode lets you preview every role.
  if (!hasDb()) {
    const p = base.extend({ role: z.string().refine(isRole, "Pick a role") }).safeParse(Object.fromEntries(fd));
    if (!p.success) return { error: p.error.issues[0].message };
    const name = p.data.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return start({ uid: "demo", org: "demo", name, email: p.data.email, role: p.data.role as Role, demo: true });
  }

  const p = base.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!authConfigured()) return { error: CONFIG_ERR };
  if (throttled(`login:${await clientKey()}`) || throttled(`login:${p.data.email}`)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  let user;
  try {
    user = await (await import("@/lib/auth-service")).verifyLogin(p.data.email, p.data.password);
  } catch (e) {
    console.error("signIn failed", e);
    return { error: `Couldn't sign in right now (code: ${tag(e)}). Please try again.` };
  }
  if (!user) return { error: BAD_LOGIN };
  return startOrChallenge(user);
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ name: z.string().trim().min(2, "Enter your name").max(160), email, password }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!hasDb()) return { error: "The database isn't connected yet, so accounts can't be created." };
  if (!authConfigured()) return { error: CONFIG_ERR };
  if (throttled(`reg:${await clientKey()}`, 5)) return { error: "Too many attempts. Try again in a few minutes." };

  let created: { uid: string; org: string; role: Role };
  try {
    created = await (await import("@/lib/auth-service")).createAccount(p.data.name, p.data.email, p.data.password);
  } catch (e) {
    if (tag(e) === "ER_DUP_ENTRY") return { error: "An account with this email already exists." };
    console.error("register failed", e);
    return { error: `Couldn't create the account (code: ${tag(e)}). Please try again.` };
  }
  return start({ ...created, name: p.data.name, email: p.data.email });
}

const SENT = "If an account exists for that email, we've sent a reset link. It works once and expires in 1 hour.";

export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = email.safeParse(fd.get("email"));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!hasDb()) return { error: "The database isn't connected yet." };
  const { smtpConfigured, appUrl } = await import("@/lib/mailer");
  // Configuration problems are reported plainly: they don't depend on whether the email has an account.
  if (!smtpConfigured() || !appUrl()) return { error: "Password reset email isn't set up yet. Ask your admin to reset your password." };
  if (throttled(`forgot:${await clientKey()}`, 5, 15 * 60_000) || throttled(`forgot:${p.data}`, 3, 15 * 60_000)) {
    return { error: "Too many requests. Try again in a few minutes." };
  }
  try {
    await (await import("@/lib/auth-service")).requestPasswordReset(p.data);
  } catch (e) {
    console.error("password reset request failed", e); // same reply either way: don't reveal whether the account exists
  }
  return { ok: SENT };
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    token: z.string().min(20).max(100), password, confirm: z.string(),
  }).refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!hasDb()) return { error: "The database isn't connected yet." };
  if (throttled(`reset:${await clientKey()}`, 10, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  let ok = false;
  try {
    ok = await (await import("@/lib/auth-service")).completePasswordReset(p.data.token, p.data.password);
  } catch (e) {
    console.error("password reset failed", e);
    return { error: `Couldn't reset the password (code: ${tag(e)}). Please try again.` };
  }
  if (!ok) return { error: "This reset link is invalid or has expired. Request a new one." };
  redirect("/login?reset=1");
}

const MAGIC_SENT = "If an account exists for that email, we've sent a sign-in link. It works once and expires in 15 minutes.";

export async function requestMagic(_: FormState, fd: FormData): Promise<FormState> {
  const p = email.safeParse(fd.get("email"));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!hasDb()) return { error: "The database isn't connected yet." };
  const { smtpConfigured, appUrl } = await import("@/lib/mailer");
  if (!smtpConfigured() || !appUrl()) return { error: "Email sign-in isn't set up yet. Use your password instead." };
  if (throttled(`magic:${await clientKey()}`, 5, 15 * 60_000) || throttled(`magic:${p.data}`, 3, 15 * 60_000)) return { error: "Too many requests. Try again in a few minutes." };
  try {
    await (await import("@/lib/auth-service")).requestMagicLink(p.data);
  } catch (e) {
    console.error("magic link request failed", e); // same reply either way
  }
  return { ok: MAGIC_SENT };
}

/** Called by the "Sign in" button on /magic (a POST, so email-link scanners that merely fetch the URL can't burn the token). */
export async function consumeMagic(_: FormState, fd: FormData): Promise<FormState> {
  const t = z.string().min(20).max(100).safeParse(fd.get("token"));
  if (!t.success) return { error: "This sign-in link is invalid." };
  if (!hasDb() || !authConfigured()) return { error: CONFIG_ERR };
  if (throttled(`magicuse:${await clientKey()}`, 10, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  let user;
  try {
    user = await (await import("@/lib/auth-service")).consumeMagicLink(t.data);
  } catch (e) {
    console.error("magic link failed", e);
    return { error: `Couldn't sign in (code: ${tag(e)}). Please try again.` };
  }
  if (!user) return { error: "This sign-in link is invalid or has expired. Request a new one." };
  return startOrChallenge(user);
}