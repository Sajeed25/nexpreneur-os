import { redirect } from "next/navigation";
import { getSession } from "./session";
import { can, type Section } from "./rbac";

/** Server-side authorization: never rely on hidden nav links alone. */
export async function requireSection(section: Section) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!can(s.role, section)) redirect("/dashboard");
  return s;
}
