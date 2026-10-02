import { cookies } from "next/headers";
import { isRole, type Role } from "./rbac";

export type Session = { name: string; email: string; role: Role };

/** Reads the session cookie. Swap for Supabase `getUser()` + profile lookup in production. */
export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get("nx_session")?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(decodeURIComponent(raw));
    if (typeof s.name === "string" && typeof s.email === "string" && isRole(s.role)) return s;
  } catch {}
  return null;
}
