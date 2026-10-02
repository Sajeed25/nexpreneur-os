import { cookies } from "next/headers";
import { COOKIE, readSession, type Session } from "./auth";
import { hasDb } from "./db/config";

export type { Session };

export async function getSession(): Promise<Session | null> {
  const s = await readSession((await cookies()).get(COOKIE)?.value);
  // A demo-mode cookie must stop working once a real database is connected.
  if (s?.demo && hasDb()) return null;
  return s;
}
