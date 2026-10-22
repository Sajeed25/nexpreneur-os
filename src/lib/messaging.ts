import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import webpush from "web-push";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tx } from "@/lib/payments-server";
import { appUrl } from "@/lib/mailer";
import { normalizePhone, oneLine } from "@/lib/phone";

const { messageOutbox, pushSubscriptions, users } = schema;
type Exec = ReturnType<typeof db> | Tx;

const set = (v?: string) => !!v && v !== "placeholder";
export const whatsappConfigured = () => set(process.env.WHATSAPP_TOKEN) && set(process.env.WHATSAPP_PHONE_ID);
export const smsConfigured = () => set(process.env.MSG91_AUTH_KEY) && set(process.env.MSG91_TEMPLATE_ID);
export const pushConfigured = () => set(process.env.VAPID_PUBLIC_KEY) && set(process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => (pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null);

/** Kinds that are worth a WhatsApp/SMS message. Everything else stays in the app (and push, when enabled). */
export const TEXT_KINDS = new Set(["invoice", "reminder", "renewal", "payment", "refund", "visitor", "booking", "system"]);
const MAX_ATTEMPTS = 3;

export type Outbound = { org: string; userId: string; kind: string; title: string; body?: string | null; link?: string | null };

/**
 * Queues WhatsApp / SMS / push copies of an in-app notification, for people who opted in and when the provider is set up.
 * Never throws: a messaging problem must not undo the action that caused it.
 */
export async function queueOutbound(exec: Exec, n: Outbound) {
  try {
    const wa = whatsappConfigured(), sms = smsConfigured(), push = pushConfigured();
    if (!wa && !sms && !push) return;
    const [u] = await exec.select({ phone: users.phone, wa: users.waOptIn, sms: users.smsOptIn }).from(users).where(eq(users.id, n.userId));
    if (!u) return;
    const rows: (typeof messageOutbox.$inferInsert)[] = [];
    const to = normalizePhone(u.phone);
    const text = TEXT_KINDS.has(n.kind);
    if (text && to && wa && u.wa) rows.push({ organizationId: n.org, userId: n.userId, channel: "whatsapp", toAddr: to, title: n.title.slice(0, 160), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null });
    if (text && to && sms && u.sms) rows.push({ organizationId: n.org, userId: n.userId, channel: "sms", toAddr: to, title: n.title.slice(0, 160), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null });
    if (push) {
      const [c] = await exec.select({ n: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
      if (Number(c.n) > 0) rows.push({ organizationId: n.org, userId: n.userId, channel: "push", toAddr: null, title: n.title.slice(0, 160), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null });
    }
    if (!rows.length) return;
    await exec.insert(messageOutbox).values(rows);
    scheduleDrain();
  } catch (e) {
    console.error("queueOutbound failed", e);
  }
}

let drainScheduled = false;
/** Sends what's queued right after the current response finishes (so a slow provider never delays the user). */
export function scheduleDrain() {
  if (drainScheduled) return;
  try {
    drainScheduled = true;
    after(async () => { try { await drainOutbox(25); } catch (e) { console.error("drain failed", e); } finally { drainScheduled = false; } });
  } catch {
    drainScheduled = false; // outside a request (a script or a test): the next cron pass will send it
  }
}

// ---------- Providers ----------
class Permanent extends Error {}

async function sendWhatsApp(to: string, title: string, body: string) {
  const r = await fetch(`${process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v20.0"}/${encodeURIComponent(process.env.WHATSAPP_PHONE_ID!)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name: process.env.WHATSAPP_TEMPLATE || "nx_notification", language: { code: process.env.WHATSAPP_LANG || "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: oneLine(title, 160) }, { type: "text", text: oneLine(body || "-", 500) }] }] },
    }),
  });
  if (!r.ok) {
    const msg = ((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${r.status}`;
    if (r.status >= 400 && r.status < 500 && r.status !== 429) throw new Permanent(msg.slice(0, 190));
    throw new Error(msg.slice(0, 190));
  }
  return ((await r.json()) as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null;
}

async function sendSms(to: string, title: string, body: string) {
  const r = await fetch(`${process.env.MSG91_API_BASE || "https://control.msg91.com/api/v5"}/flow`, {
    method: "POST", headers: { "Content-Type": "application/json", authkey: process.env.MSG91_AUTH_KEY! }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: to, var1: oneLine(title, 60), var2: oneLine(body, 120) }] }),
  });
  const j = (await r.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!r.ok || j?.type === "error") {
    const msg = (j?.message ?? `HTTP ${r.status}`).slice(0, 190);
    if (r.status >= 400 && r.status < 500 && r.status !== 429) throw new Permanent(msg);
    throw new Error(msg);
  }
  return j?.message ?? null;
}

let vapidReady = false;
async function sendPush(userId: string, m: { title: string; body: string | null; link: string | null }) {
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || appUrl() || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  const subs = await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const payload = JSON.stringify({ title: m.title, body: m.body ?? "", url: m.link ?? "/notifications" });
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); // the browser unsubscribed
      else console.error("push failed", code);
    }
  }
  if (!ok && subs.length) throw new Error("No device accepted the push");
  if (!subs.length) throw new Permanent("No subscribed device");
  return `${ok} device${ok === 1 ? "" : "s"}`;
}

/** Sends queued messages. Safe to run from several places at once: each row is claimed before it is sent. */
export async function drainOutbox(limit = 50): Promise<{ sent: number; failed: number; retry: number }> {
  const d = db();
  const rows = await d.select().from(messageOutbox).where(and(eq(messageOutbox.status, "queued"), lt(messageOutbox.attempts, MAX_ATTEMPTS))).orderBy(asc(messageOutbox.createdAt)).limit(limit);
  let sent = 0, failed = 0, retry = 0;
  const base = appUrl();
  for (const m of rows) {
    const claim = await d.update(messageOutbox).set({ attempts: m.attempts + 1 }).where(and(eq(messageOutbox.id, m.id), eq(messageOutbox.status, "queued"), eq(messageOutbox.attempts, m.attempts)));
    if (!(claim[0] as { affectedRows?: number }).affectedRows) continue;
    const text = [m.body, m.link && base ? `${base}${m.link}` : ""].filter(Boolean).join(" ");
    try {
      let providerId: string | null = null;
      if (m.channel === "whatsapp") providerId = await sendWhatsApp(m.toAddr!, m.title, text);
      else if (m.channel === "sms") providerId = await sendSms(m.toAddr!, m.title, text);
      else providerId = await sendPush(m.userId, { title: m.title, body: m.body, link: m.link });
      await d.update(messageOutbox).set({ status: "sent", sentAt: new Date(), providerId: providerId?.slice(0, 80) ?? null, error: null }).where(eq(messageOutbox.id, m.id));
      sent++;
    } catch (e) {
      const err = (e instanceof Error ? e.message : "error").slice(0, 190);
      const dead = e instanceof Permanent || m.attempts + 1 >= MAX_ATTEMPTS;
      await d.update(messageOutbox).set({ status: dead ? "failed" : "queued", error: err }).where(eq(messageOutbox.id, m.id));
      if (dead) failed++; else retry++;
    }
  }
  return { sent, failed, retry };
}

export const hashEndpoint = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** Recent delivery stats for the settings screen. */
export async function outboxStats(org: string) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  return db().select({ channel: messageOutbox.channel, status: messageOutbox.status, n: sql<number>`count(*)` }).from(messageOutbox)
    .where(and(eq(messageOutbox.organizationId, org), sql`${messageOutbox.createdAt} >= ${since}`)).groupBy(messageOutbox.channel, messageOutbox.status);
}
