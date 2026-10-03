import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { safeEq } from "@/lib/payments-server";

// ---- Signed short-lived blob (carries state + PKCE verifier in a cookie across the Google redirect) ----
const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET not configured");
  return s;
};
const mac = (body: string) => createHmac("sha256", key()).update(`oauth:${body}`).digest("base64url");

export function signBlob(data: Record<string, unknown>, ttlMs = 10 * 60_000) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${mac(body)}`;
}
export function verifyBlob<T>(token: string | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEq(sig, mac(body))) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return o.exp > Date.now() ? o : null;
  } catch { return null; }
}

// ---- Google (authorization code + PKCE) ----
export const googleConfigured = () => {
  const id = process.env.GOOGLE_CLIENT_ID, s = process.env.GOOGLE_CLIENT_SECRET;
  return !!id && !!s && id !== "placeholder" && s !== "placeholder";
};

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(16).toString("base64url") };
}

export type GoogleClaims = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean | string; name?: string };

/** The id_token is received straight from Google's token endpoint over TLS, so we check its claims (not a signature). */
export function validGoogleClaims(c: GoogleClaims, clientId: string, nowSec = Math.floor(Date.now() / 1000)) {
  return (
    (c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com") &&
    c.aud === clientId && typeof c.exp === "number" && c.exp > nowSec &&
    !!c.email && (c.email_verified === true || c.email_verified === "true")
  );
}
export const decodeJwtPayload = (jwt: string): GoogleClaims | null => {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()); } catch { return null; }
};
