"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COOKIE, authConfigured, cookieOptions, signSession, throttled } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";
import { isRole, type Role } from "@/lib/rbac";

export type FormState = { error?: string; ok?: string };

const HOME: Record<Role, string> = {
  super_admin: "/dashboard", owner: "/dashboard", location_manager: "/dashboard",
  reception: "/visitors", finance: "/invoices", community_manager: "/community",
  staff: "/bookings", member: "/dashboard",
};

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
  return start(user);
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

const SOON = "Password reset by email is coming soon. Ask an admin to reset your password for now.";
export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = email.safeParse(fd.get("email"));
  return { error: p.success ? SOON : p.error.issues[0].message };
}
export async function resetPassword(): Promise<FormState> {
  return { error: SOON };
}
