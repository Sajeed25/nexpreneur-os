import { createHash, randomBytes } from "node:crypto";

export const RESET_TTL_MS = 60 * 60_000; // 1 hour

/** The raw token goes in the email link; only its SHA-256 is stored, so a database leak can't be used to reset accounts. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** A session is revoked if it was issued (iat, seconds) before the password last changed. Compared at whole-second precision. */
export function sessionRevoked(iatSeconds: number | undefined, changedAt: Date | null | undefined) {
  if (!changedAt) return false;
  return (iatSeconds ?? 0) < Math.floor(changedAt.getTime() / 1000);
}
