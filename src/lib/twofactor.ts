import "server-only";
import { cache } from "react";
import QRCode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { base32Encode, decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newSecret, otpauthUri, verifyTotp } from "@/lib/totp";

const { users, recoveryCodes, organizations, auditLogs } = schema;

export type TwoFactorStatus = { enabled: boolean; settingUp: boolean; recoveryLeft: number };

export async function twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [u] = await db().select({ s: users.totpSecret, at: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  const left = await db().select({ id: recoveryCodes.id }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return { enabled: !!u?.at && !!u.s, settingUp: !!u?.s && !u.at, recoveryLeft: left.length };
}

/** Makes a fresh secret and keeps it (encrypted) as "pending" until the person proves their app can produce a code. */
export async function beginSetup(userId: string, email: string, issuer = "Nexpreneur OS") {
  const secret = newSecret();
  await db().update(users).set({ totpSecret: encryptSecret(secret), totpEnabledAt: null }).where(and(eq(users.id, userId), isNull(users.totpEnabledAt)));
  const b32 = base32Encode(secret);
  const uri = otpauthUri(b32, email, issuer);
  return { secret: b32, uri, qr: await QRCode.toDataURL(uri, { width: 220, margin: 1 }) };
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await db().transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashRecovery(c) })));
  });
  return codes;
}

/** The person typed a code from their app: if it's right, two-factor is on and they get their recovery codes (shown once). */
export async function confirmSetup(userId: string, org: string, code: string): Promise<string[] | null> {
  const [u] = await db().select({ s: users.totpSecret, at: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  const secret = u && !u.at ? decryptSecret(u.s) : null;
  if (!secret || verifyTotp(secret, code) == null) return null;
  await db().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, userId));
  await db().insert(auditLogs).values({ organizationId: org, actorId: userId, action: "auth.2fa_enabled", entity: "user", entityId: userId });
  return replaceRecoveryCodes(userId);
}

export const regenerateRecovery = (userId: string) => replaceRecoveryCodes(userId);

/** Checks a sign-in code: an authenticator code, or (once) a recovery code. */
export async function checkChallenge(userId: string, input: string): Promise<"totp" | "recovery" | null> {
  const [u] = await db().select({ s: users.totpSecret, at: users.totpEnabledAt }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!u?.at) return null;
  const clean = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(clean)) {
    const secret = decryptSecret(u.s);
    return secret && verifyTotp(secret, clean) != null ? "totp" : null;
  }
  // A recovery code works once: claim it with an UPDATE so two attempts can't both use it.
  const r = await db().update(recoveryCodes).set({ usedAt: new Date() }).where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, hashRecovery(clean)), isNull(recoveryCodes.usedAt)));
  return (r[0] as { affectedRows?: number }).affectedRows ? "recovery" : null;
}

export async function disableTwoFactor(userId: string, org: string, actor: string) {
  await db().update(users).set({ totpSecret: null, totpEnabledAt: null }).where(and(eq(users.id, userId), eq(users.organizationId, org)));
  await db().delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db().insert(auditLogs).values({ organizationId: org, actorId: actor, action: actor === userId ? "auth.2fa_disabled" : "auth.2fa_reset", entity: "user", entityId: userId });
}

/** True when the organisation requires two-factor for this role and the person hasn't set it up yet. One lookup per request. */
export const needsTwoFactorSetup = cache(async (org: string, userId: string, role: string): Promise<boolean> => {
  const [o] = await db().select({ r: organizations.require2faRoles }).from(organizations).where(eq(organizations.id, org));
  if (!o?.r || !o.r.split(",").includes(role)) return false;
  const [u] = await db().select({ at: users.totpEnabledAt }).from(users).where(eq(users.id, userId));
  return !u?.at;
});
