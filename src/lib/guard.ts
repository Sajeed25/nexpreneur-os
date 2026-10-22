import { redirect } from "next/navigation";
import { getSession } from "./session";
import { can, type Section } from "./rbac";
import { hasDb } from "./db/config";

/** Server-side authorization: never rely on hidden nav links alone. */
export async function requireSection(section: Section) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!can(s.role, section)) redirect("/dashboard");
  // If the organisation requires two-factor for this role, everything except the person's own profile waits until it is set up.
  if (section !== "profile" && !s.demo && !s.sso && hasDb()) {
    const { needsTwoFactorSetup } = await import("./twofactor");
    if (await needsTwoFactorSetup(s.org, s.uid, s.role)) redirect("/profile/security");
  }
  return s;
}
