import { SignJWT, jwtVerify } from "jose";
import { isRole, type Role } from "./rbac";

export type Session = { uid: string; org: string; name: string; email: string; role: Role; demo?: boolean; iat?: number };

export const COOKIE = "nx_session";
const MAX_AGE = 60 * 60 * 8;

/** False when AUTH_SECRET is missing or still a placeholder (production only). */
export const authConfigured = () =>
  process.env.NODE_ENV !== "production" || (process.env.AUTH_SECRET ?? "").length >= 16;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (16+ chars)");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session) {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
}

export async function readSession(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof p.uid === "string" && typeof p.org === "string" && typeof p.name === "string" && typeof p.email === "string" && isRole(p.role)) {
      return { uid: p.uid, org: p.org, name: p.name, email: p.email, role: p.role, demo: p.demo === true, iat: p.iat };
    }
  } catch {}
  return null;
}

export const cookieOptions = {
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
};

// Best-effort in-memory throttle (per process). Move to the DB/Redis if you scale to multiple instances.
const hits = new Map<string, { n: number; reset: number }>();
export function throttled(k: string, limit = 8, windowMs = 10 * 60_000) {
  const now = Date.now();
  const h = hits.get(k);
  if (!h || h.reset < now) { hits.set(k, { n: 1, reset: now + windowMs }); return false; }
  h.n += 1;
  return h.n > limit;
}
