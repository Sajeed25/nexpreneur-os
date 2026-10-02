"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { COOKIE, cookieOptions, signSession, throttled } from "@/lib/auth";
import { db, hasDb, schema } from "@/lib/db";
import { isRole, type Role } from "@/lib/rbac";

export type FormState = { error?: string; ok?: string };

const HOME: Record<Role, string> = {
  super_admin: "/dashboard", owner: "/dashboard", location_manager: "/dashboard",
  reception: "/visitors", finance: "/invoices", community_manager: "/community",
  staff: "/bookings", member: "/dashboard",
};

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(190);
const password = z.string().min(8, "Password must be at least 8 characters").max(72);
const BAD_LOGIN = "Incorrect email or password";
// Compared when the user doesn't exist so response timing doesn't reveal which emails have accounts.
const DUMMY = bcrypt.hashSync("not-a-real-password", 10);

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
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
  if (throttled(`login:${await clientKey()}`) || throttled(`login:${p.data.email}`)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  const d = db();
  const [u] = await d.select().from(schema.users)
    .where(and(eq(schema.users.email, p.data.email), isNull(schema.users.deletedAt))).limit(1);
  const ok = await bcrypt.compare(p.data.password, u?.passwordHash ?? DUMMY);
  if (!u || !ok) return { error: BAD_LOGIN };

  await d.update(schema.users).set({ lastLoginAt: sql`CURRENT_TIMESTAMP` }).where(eq(schema.users.id, u.id));
  await d.insert(schema.auditLogs).values({ organizationId: u.organizationId, actorId: u.id, action: "auth.login", entity: "user", entityId: u.id });
  return start({ uid: u.id, org: u.organizationId, name: u.name, email: u.email, role: u.role });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/** The very first account becomes the owner and creates the organization; later sign-ups join it as members. */
export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ name: z.string().trim().min(2, "Enter your name").max(160), email, password }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!hasDb()) return { error: "The database isn't connected yet, so accounts can't be created." };
  if (throttled(`reg:${await clientKey()}`, 5)) return { error: "Too many attempts. Try again in a few minutes." };

  const hash = await bcrypt.hash(p.data.password, 11);
  let created: { uid: string; org: string; role: Role };
  try {
    created = await db().transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.organizations).limit(1);
      let orgId = existing?.id;
      let role: Role = "member";
      if (!orgId) {
        orgId = crypto.randomUUID();
        role = "owner";
        await tx.insert(schema.organizations).values({ id: orgId, name: "Nexpreneur", slug: "nexpreneur" });
        await tx.insert(schema.locations).values(
          ["Hyderabad", "Warangal", "Nalgonda"].map((c) => ({ organizationId: orgId!, name: `Nexpreneur ${c}`, city: c })),
        );
        await tx.insert(schema.membershipPlans).values([
          { name: "Flexi", pricePaise: 399900 }, { name: "Fixed Desk", pricePaise: 499900 },
          { name: "Private Office", pricePaise: 1999900 }, { name: "Virtual Office", pricePaise: 99900 },
        ].map((x) => ({ ...x, organizationId: orgId! })));
      }
      const uid = crypto.randomUUID();
      await tx.insert(schema.users).values({ id: uid, organizationId: orgId, name: p.data.name, email: p.data.email, passwordHash: hash, role });
      await tx.insert(schema.auditLogs).values({ organizationId: orgId, actorId: uid, action: "auth.register", entity: "user", entityId: uid });
      return { uid, org: orgId, role };
    });
  } catch (e) {
    const code = typeof e === "object" && e ? ((e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code) : undefined;
    if (code === "ER_DUP_ENTRY") return { error: "An account with this email already exists." };
    console.error("register failed", e);
    return { error: "Couldn't create the account. Please try again." };
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

