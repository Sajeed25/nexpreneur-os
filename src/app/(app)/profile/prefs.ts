"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import { hashEndpoint, pushConfigured, smsConfigured, vapidPublicKey, whatsappConfigured } from "@/lib/messaging";

const { users, pushSubscriptions } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to change your preferences.";
const REPORT_ROLES = ["super_admin", "owner", "location_manager", "finance"];

async function me() {
  const s = await getSession();
  return s && !s.demo && hasDb() ? s : null;
}

export type PrefsDTO = {
  phone: string; phoneOk: boolean; waOptIn: boolean; smsOptIn: boolean; weeklyReport: boolean; canWeekly: boolean;
  whatsappReady: boolean; smsReady: boolean; pushReady: boolean; vapidKey: string | null; pushDevices: number;
};

export async function getPrefs(): Promise<Result<PrefsDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const [u] = await db().select().from(users).where(and(eq(users.id, s.uid), eq(users.organizationId, s.org)));
  if (!u) return { ok: false, error: "Account not found" };
  const [c] = await db().select({ n: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, s.uid));
  return { ok: true, data: {
    phone: u.phone ?? "", phoneOk: !!normalizePhone(u.phone), waOptIn: u.waOptIn, smsOptIn: u.smsOptIn, weeklyReport: u.weeklyReport,
    canWeekly: REPORT_ROLES.includes(s.role), whatsappReady: whatsappConfigured(), smsReady: smsConfigured(), pushReady: pushConfigured(),
    vapidKey: vapidPublicKey(), pushDevices: Number(c.n),
  } };
}

const prefsIn = z.object({ waOptIn: z.boolean(), smsOptIn: z.boolean(), weeklyReport: z.boolean() });
export async function setPrefs(input: z.infer<typeof prefsIn>): Promise<Result<null>> {
  const s = await me();
  const p = prefsIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO };
  const [u] = await db().select({ phone: users.phone }).from(users).where(eq(users.id, s.uid));
  if ((p.data.waOptIn || p.data.smsOptIn) && !normalizePhone(u?.phone)) return { ok: false, error: "Add a valid mobile number to your profile first." };
  if (p.data.weeklyReport && !REPORT_ROLES.includes(s.role)) return { ok: false, error: "The weekly report is for owners, managers and finance." };
  await db().update(users).set({ waOptIn: p.data.waOptIn, smsOptIn: p.data.smsOptIn, weeklyReport: p.data.weeklyReport }).where(eq(users.id, s.uid));
  await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "profile.notification_prefs", entity: "user", entityId: s.uid });
  return { ok: true, data: null };
}

const subIn = z.object({
  endpoint: z.string().url().max(600).refine((v) => v.startsWith("https://"), "Push endpoints must be https"),
  p256dh: z.string().min(20).max(120).regex(/^[A-Za-z0-9_-]+$/), auth: z.string().min(8).max(60).regex(/^[A-Za-z0-9_-]+$/),
});
export async function savePushSubscription(input: z.infer<typeof subIn>): Promise<Result<null>> {
  const s = await me();
  const p = subIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "That device couldn't be registered." : NO };
  if (!pushConfigured()) return { ok: false, error: "Push notifications aren't set up on this server yet." };
  const mine = await db().select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, s.uid));
  if (mine.length >= 5) return { ok: false, error: "You can enable up to 5 devices. Turn one off first." };
  // The same browser may re-subscribe (or be signed in as someone else later): the endpoint belongs to whoever registered it last.
  await db().insert(pushSubscriptions).values({ organizationId: s.org, userId: s.uid, endpoint: p.data.endpoint, endpointHash: hashEndpoint(p.data.endpoint), p256dh: p.data.p256dh, auth: p.data.auth })
    .onDuplicateKeyUpdate({ set: { userId: s.uid, organizationId: s.org, p256dh: p.data.p256dh, auth: p.data.auth } });
  return { ok: true, data: null };
}

export async function removePushSubscription(endpoint: string): Promise<Result<null>> {
  const s = await me();
  if (!s || typeof endpoint !== "string") return { ok: false, error: NO };
  await db().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpointHash, hashEndpoint(endpoint)), eq(pushSubscriptions.userId, s.uid)));
  return { ok: true, data: null };
}

/** Emails last week's report to the signed-in person right now (owners, managers and finance), so they can see what it looks like. */
export async function sendMyReport(): Promise<Result<{ week: string }>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  if (!REPORT_ROLES.includes(s.role)) return { ok: false, error: "The weekly report is for owners, managers and finance." };
  const { sendReportNow } = await import("@/lib/reports");
  const r = await sendReportNow({ id: s.uid, name: s.name, email: s.email, org: s.org });
  return r.ok ? { ok: true, data: { week: r.week } } : { ok: false, error: r.error };
}

// ---------- Calendar feed ----------
export type CalendarFeedDTO = { url: string | null; ready: boolean };

const feedUrl = (token: string) => `${process.env.AUTH_URL ?? ""}/api/calendar/feed/${token}.ics`;

/** The private address people paste into Google / Apple / Outlook to see their bookings, events and visitors in their own calendar. */
export async function getCalendarFeed(): Promise<Result<CalendarFeedDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const [u] = await db().select({ t: users.calendarToken }).from(users).where(eq(users.id, s.uid));
  return { ok: true, data: { url: u?.t ? feedUrl(u.t) : null, ready: !!(process.env.AUTH_URL ?? "").startsWith("http") } };
}

/** Makes a new address (the first one, or a replacement). The old address stops working at once. */
export async function rotateCalendarFeed(): Promise<Result<CalendarFeedDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const { newCalendarToken } = await import("@/lib/calendar");
  const token = newCalendarToken();
  await db().update(users).set({ calendarToken: token }).where(eq(users.id, s.uid));
  await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "calendar.feed_rotate", entity: "user", entityId: s.uid });
  return { ok: true, data: { url: feedUrl(token), ready: !!(process.env.AUTH_URL ?? "").startsWith("http") } };
}

export async function revokeCalendarFeed(): Promise<Result<null>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  await db().update(users).set({ calendarToken: null }).where(eq(users.id, s.uid));
  return { ok: true, data: null };
}

/** Sends a test through every channel the person has turned on, so they can check it works. */
export async function sendTestNotification(): Promise<Result<null>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  await notify(db(), { org: s.org, userId: s.uid, kind: "system", title: "Test from Nexpreneur OS", body: "If you can read this on your phone, notifications are working.", link: "/profile" });
  return { ok: true, data: null };
}
