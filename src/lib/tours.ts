import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (16+ chars)");
    return Buffer.from("dev-only-insecure-secret-change-me");
  }
  return createHmac("sha256", s).update("nx-tour-cancel-v1").digest();
}
const sig = (id: string) => createHmac("sha256", key()).update(id).digest().subarray(0, 12).toString("base64url");

/** A link in the confirmation email lets the visitor cancel or see their tour without an account. It is signed, so it can't be guessed. */
export const tourToken = (tourId: string) => `${tourId}.${sig(tourId)}`;

export function verifyTourToken(token: string): string | null {
  const m = token.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{16})$/);
  if (!m) return null;
  const a = Buffer.from(sig(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}
