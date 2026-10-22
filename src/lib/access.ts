import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { throttled } from "@/lib/auth";
import { todayIST } from "@/lib/booking";
import { decideAccess, parseCredential, type AccessDecision } from "@/lib/access-math";
import { blockedByOnboarding } from "@/lib/onboarding";

const { doors, accessCredentials, accessEvents, users, memberships, bookings, visitorInvites } = schema;

export const BUCKET_MS = 60_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function passKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (16+ chars)");
    return Buffer.from("dev-only-insecure-secret-change-me");
  }
  return createHmac("sha256", s).update("nx-door-pass-v1").digest(); // separate key from the session cookie's
}
const sign = (uid: string, bucket: number) => createHmac("sha256", passKey()).update(`${uid}.${bucket}`).digest().subarray(0, 16).toString("base64url");

/** A member's pass: it changes every minute, so a screenshot of it stops working almost immediately. */
export function makePass(uid: string, now = Date.now()) {
  const bucket = Math.floor(now / BUCKET_MS);
  return { token: `NX1.${uid}.${bucket}.${sign(uid, bucket)}`, refreshInMs: BUCKET_MS - (now % BUCKET_MS) };
}

/** Accepts the current minute and one either side (clock drift between phone and door). */
export function passValid(uid: string, bucket: number, sig: string, now = Date.now()) {
  if (Math.abs(Math.floor(now / BUCKET_MS) - bucket) > 1) return false;
  const a = Buffer.from(sign(uid, bucket)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newDoorKey = () => { const key = `nxd_${randomBytes(24).toString("base64url")}`; return { key, hash: sha256(key) }; };
export const doorKeyHash = (key: string) => sha256(key);
export const cardHash = (org: string, card: string) => sha256(`${org}:${card}`);

export type DoorResult = { status: 200 | 401 | 429; body: { allow: boolean; reason: string; name?: string } };

/** What a door controller calls. Always logs the attempt. A bad door key gets a 401 and nothing else is revealed. */
export async function verifyAtDoor(key: string | null, rawCredential: string, now = new Date()): Promise<DoorResult> {
  if (!key) return { status: 401, body: { allow: false, reason: "Unknown door" } };
  const d = db();
  const [door] = await d.select().from(doors).where(and(eq(doors.keyHash, doorKeyHash(key)), eq(doors.active, true)));
  if (!door) return { status: 401, body: { allow: false, reason: "Unknown door" } };
  if (throttled(`door:${door.id}`, 300, 60_000)) return { status: 429, body: { allow: false, reason: "Too many requests" } };
  await d.update(doors).set({ lastSeenAt: now }).where(eq(doors.id, door.id));

  const log = async (kind: string, userId: string | null, dec: AccessDecision) => {
    await d.insert(accessEvents).values({ organizationId: door.organizationId, doorId: door.id, userId, credential: kind, result: dec.allow ? "allowed" : "denied", reason: dec.reason.slice(0, 80) });
  };
  const cred = parseCredential(rawCredential);
  if (!cred) { const dec = { allow: false, reason: "Unreadable credential" }; await log("unknown", null, dec); return { status: 200, body: dec }; }

  // ----- a visitor's code: valid only for today's visit, and only once reception has checked them in -----
  if (cred.kind === "visitor") {
    const [v] = await d.select().from(visitorInvites).where(and(eq(visitorInvites.token, cred.token), eq(visitorInvites.organizationId, door.organizationId)));
    const dec = !v ? { allow: false, reason: "Unknown visitor code" } : v.status !== "checked_in" ? { allow: false, reason: v.status === "invited" ? "Not checked in at reception" : "Visit is over" } : v.visitDate !== todayIST() ? { allow: false, reason: "Not today's visit" } : { allow: true, reason: "Visitor" };
    await log("visitor", null, dec);
    return { status: 200, body: { ...dec, ...(dec.allow && v ? { name: v.name } : {}) } };
  }

  // ----- a member / staff: find who it is -----
  let userId: string | null = null;
  if (cred.kind === "pass") {
    if (passValid(cred.uid, cred.bucket, cred.sig, now.getTime())) userId = cred.uid;
  } else {
    const [c] = await d.select().from(accessCredentials).where(and(eq(accessCredentials.organizationId, door.organizationId), eq(accessCredentials.identifierHash, cardHash(door.organizationId, cred.card)), eq(accessCredentials.active, true)));
    userId = c?.userId ?? null;
  }
  const kind = cred.kind === "pass" ? "pass" : "card";
  if (!userId) { const dec = { allow: false, reason: cred.kind === "pass" ? "Pass expired or invalid" : "Unknown card" }; await log(kind, null, dec); return { status: 200, body: dec }; }

  const [u] = await d.select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, door.organizationId)));
  if (!u) { const dec = { allow: false, reason: "Unknown person" }; await log(kind, null, dec); return { status: 200, body: dec }; }
  const ms = await d.select({ status: memberships.status, locationId: memberships.locationId }).from(memberships).where(and(eq(memberships.userId, u.id), eq(memberships.organizationId, door.organizationId)));
  const soon = new Date(now.getTime() + 15 * 60_000), recent = new Date(now.getTime() - 15 * 60_000);
  const [bk] = await d.select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.userId, u.id), eq(bookings.locationId, door.locationId), inArray(bookings.status, ["confirmed", "pending"]), lt(bookings.startsAt, soon), gt(bookings.endsAt, recent),
  )).limit(1);
  const ob = await blockedByOnboarding(door.organizationId, u.id, u.role);
  const dec = decideAccess({ doorLocationId: door.locationId, user: { role: u.role, deleted: !!u.deletedAt, locationId: u.locationId }, memberships: ms, bookingNow: !!bk, onboardingBlocked: ob.blocked });
  await log(kind, u.id, dec);
  return { status: 200, body: { ...dec, ...(dec.allow ? { name: u.name } : {}) } };
}

export type DoorEventDTO = { id: string; at: string; door: string; who: string | null; credential: string; allowed: boolean; reason: string | null };
export async function recentEvents(org: string, opts: { userId?: string; limit?: number } = {}): Promise<DoorEventDTO[]> {
  const rows = await db().select({ e: accessEvents, door: doors.name, who: users.name }).from(accessEvents)
    .innerJoin(doors, eq(doors.id, accessEvents.doorId)).leftJoin(users, eq(users.id, accessEvents.userId))
    .where(and(eq(accessEvents.organizationId, org), opts.userId ? eq(accessEvents.userId, opts.userId) : undefined))
    .orderBy(desc(accessEvents.createdAt)).limit(opts.limit ?? 40);
  return rows.map(({ e, door, who }) => ({ id: e.id, at: e.createdAt.toISOString(), door, who, credential: e.credential, allowed: e.result === "allowed", reason: e.reason }));
}
