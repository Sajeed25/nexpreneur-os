import { cache } from "react";
import { cookies } from "next/headers";
import { COOKIE, readSession, type Session } from "./auth";
import { hasDb } from "./db/config";

export type { Session };

/**
 * The signed cookie proves who you are; the database decides what you are *now*.
 * One lookup per request (React cache) so a removed or re-roled user loses access immediately, not when the cookie expires.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const s = await readSession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  // A demo-mode cookie must stop working once a real database is connected.
  if (s.demo) return hasDb() ? null : s;
  if (!hasDb()) return null;
  try {
    const { db, schema } = await import("./db");
    const { and, eq, isNull } = await import("drizzle-orm");
    const [u] = await db().select({ role: schema.users.role, name: schema.users.name, org: schema.users.organizationId }).from(schema.users)
      .where(and(eq(schema.users.id, s.uid), isNull(schema.users.deletedAt))).limit(1);
    if (!u || u.org !== s.org) return null;
    return { ...s, role: u.role, name: u.name };
  } catch (e) {
    console.error("session lookup failed", e); // fail closed
    return null;
  }
});
