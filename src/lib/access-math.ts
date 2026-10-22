// Shared (client + server) door-access rules. No database access here, so the decision logic is easy to test.

export const STAFF_ROLES = ["super_admin", "owner", "location_manager", "reception", "finance", "community_manager", "staff"];
/** Owners and super admins may enter every location; other staff only their own. */
const EVERYWHERE = ["super_admin", "owner"];

export type AccessInput = {
  doorLocationId: string;
  user: { role: string; deleted: boolean; locationId: string | null };
  memberships: { status: string; locationId: string | null }[];
  /** A confirmed booking at this location that is on now (within a few minutes either side). */
  bookingNow: boolean;
  onboardingBlocked: boolean;
};
export type AccessDecision = { allow: boolean; reason: string };

export function decideAccess(i: AccessInput): AccessDecision {
  if (i.user.deleted) return { allow: false, reason: "Account deactivated" };
  if (STAFF_ROLES.includes(i.user.role)) {
    if (!EVERYWHERE.includes(i.user.role) && i.user.locationId && i.user.locationId !== i.doorLocationId) return { allow: false, reason: "Staff of another location" };
    return { allow: true, reason: "Staff" };
  }
  if (i.onboardingBlocked) return { allow: false, reason: "Onboarding incomplete" };
  const plan = i.memberships.some((m) => m.status === "active" && (!m.locationId || m.locationId === i.doorLocationId));
  if (plan) return { allow: true, reason: "Active plan" };
  if (i.bookingNow) return { allow: true, reason: "Booking" };
  return { allow: false, reason: i.memberships.some((m) => m.status === "active") ? "Plan is for another location" : "No active plan or booking" };
}

/** RFID/NFC card ids come in many shapes ("04:A3:5B:..", "04a35b", "04 A3 5B"): compare them as upper-case hex without separators. */
export function normalizeCard(raw: string): string | null {
  const h = raw.replace(/[\s:\-]/g, "").toUpperCase();
  return /^[0-9A-F]{6,32}$/.test(h) ? h : null;
}

export type Credential = { kind: "pass"; uid: string; bucket: number; sig: string } | { kind: "visitor"; token: string } | { kind: "card"; card: string } | null;

/** What a door reader sent: a member's rotating pass (NX1.<user>.<minute>.<sig>), a visitor's 32-character code, or rfid:<card id>. */
export function parseCredential(raw: string): Credential {
  const s = raw.trim();
  const p = s.match(/^NX1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,10})\.([A-Za-z0-9_-]{16,64})$/);
  if (p) return { kind: "pass", uid: p[1], bucket: Number(p[2]), sig: p[3] };
  if (/^[0-9a-f]{32}$/.test(s)) return { kind: "visitor", token: s };
  const c = s.match(/^rfid:(.+)$/i);
  if (c) { const card = normalizeCard(c[1]); return card ? { kind: "card", card } : null; }
  return null;
}
