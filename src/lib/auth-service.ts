import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/rbac";
import { hashToken, newResetToken, RESET_TTL_MS } from "@/lib/reset-token";
import { appUrl, resetEmail, sendMail } from "@/lib/mailer";

// Loaded lazily (dynamic import) by the auth actions so the DB driver and hashing
// libraries are never evaluated just to render the login/register pages.

type U = { uid: string; org: string; name: string; email: string; role: Role };

let dummy: string | undefined;
/** Compared when the user doesn't exist so response timing doesn't reveal which emails have accounts. */
const dummyHash = () => (dummy ??= bcrypt.hashSync("not-a-real-password", 10));

export async function verifyLogin(email: string, password: string): Promise<U | null> {
  const d = db();
  const [u] = await d.select().from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt))).limit(1);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? dummyHash());
  if (!u || !ok) return null;
  await d.update(schema.users).set({ lastLoginAt: sql`CURRENT_TIMESTAMP` }).where(eq(schema.users.id, u.id));
  await d.insert(schema.auditLogs).values({ organizationId: u.organizationId, actorId: u.id, action: "auth.login", entity: "user", entityId: u.id });
  return { uid: u.id, org: u.organizationId, name: u.name, email: u.email, role: u.role };
}

/** The very first account becomes the owner and creates the organization; later sign-ups join it as members. */
export async function createAccount(name: string, email: string, password: string): Promise<{ uid: string; org: string; role: Role }> {
  const hash = await bcrypt.hash(password, 11);
  return db().transaction(async (tx) => {
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
    await tx.insert(schema.users).values({ id: uid, organizationId: orgId, name, email, passwordHash: hash, role });
    await tx.insert(schema.auditLogs).values({ organizationId: orgId, actorId: uid, action: "auth.register", entity: "user", entityId: uid });
    return { uid, org: orgId, role };
  });
}

/** Creates a single-use reset token and emails the link. Silent when the email has no account (no enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  const base = appUrl();
  if (!base) throw new Error("AUTH_URL_NOT_SET");
  const d = db();
  const [u] = await d.select().from(schema.users).where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt))).limit(1);
  if (!u) return;
  const { token, hash } = newResetToken();
  await d.insert(schema.passwordResets).values({ userId: u.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  await d.insert(schema.auditLogs).values({ organizationId: u.organizationId, actorId: u.id, action: "auth.reset_requested", entity: "user", entityId: u.id });
  const mail = resetEmail(u.name, `${base}/reset-password?token=${token}`);
  await sendMail(u.email, mail.subject, mail.text, mail.html);
}

/** Validates the token, sets the new password, burns the token and signs out older sessions. Returns false for a bad/expired/used token. */
export async function completePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const hash = hashToken(token);
  const newHash = await bcrypt.hash(newPassword, 11);
  return db().transaction(async (tx) => {
    const [r] = await tx.select().from(schema.passwordResets)
      .where(and(eq(schema.passwordResets.tokenHash, hash), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date()))).for("update");
    if (!r) return false;
    const [u] = await tx.select().from(schema.users).where(and(eq(schema.users.id, r.userId), isNull(schema.users.deletedAt)));
    if (!u) return false;
    await tx.update(schema.users).set({ passwordHash: newHash, passwordChangedAt: new Date() }).where(eq(schema.users.id, u.id));
    await tx.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.userId, u.id), isNull(schema.passwordResets.usedAt)));
    await tx.insert(schema.auditLogs).values({ organizationId: u.organizationId, actorId: u.id, action: "auth.password_reset", entity: "user", entityId: u.id });
    return true;
  });
}