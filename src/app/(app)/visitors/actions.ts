"use server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { todayIST } from "@/lib/booking";
import { notify } from "@/lib/notify";
import QRCode from "qrcode";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { visitorEmail } from "@/lib/emails";

const { visitorInvites, users, auditLogs, organizations } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type VisitorDTO = {
  id: string; name: string; phone: string; email: string; host: string; date: string; time: string; purpose: string;
  token: string; status: string; checkedInAt: string | null; checkedOutAt: string | null;
};
const DESK = ["super_admin", "owner", "location_manager", "reception", "staff"];
const NO = "Sign in with a real account to use visitors.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "visitors") ? s : null;
}

export async function listVisitors(): Promise<Result<VisitorDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const desk = DESK.includes(s.role);
  const from = todayIST(-1), to = todayIST(60);
  const rows = await db().select({ v: visitorInvites, h: users }).from(visitorInvites).innerJoin(users, eq(users.id, visitorInvites.hostUserId))
    .where(and(eq(visitorInvites.organizationId, s.org), gte(visitorInvites.visitDate, from), lte(visitorInvites.visitDate, to), desk ? undefined : eq(visitorInvites.hostUserId, s.uid)))
    .orderBy(asc(visitorInvites.visitDate), asc(visitorInvites.visitTime)).limit(300);
  return { ok: true, data: rows.map(({ v, h }) => ({
    id: v.id, name: v.name, phone: v.phone ?? "", email: v.email ?? "", host: h.name, date: v.visitDate, time: v.visitTime, purpose: v.purpose ?? "",
    token: v.token, status: v.status, checkedInAt: v.checkedInAt?.toISOString() ?? null, checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
  })) };
}

const inviteIn = z.object({
  name: z.string().trim().min(2, "Enter the visitor's name").max(160),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/),
  purpose: z.string().trim().max(255),
  email: z.string().trim().max(190).email("Enter a valid email").or(z.literal("")),
});

/** Emails the visitor their invitation with the QR code embedded. Never throws; reports whether it worked. */
async function mailInvite(org: string, v: { name: string; email: string | null; visitDate: string; visitTime: string; purpose: string | null; token: string }, hostName: string) {
  if (!v.email) return { sent: false, reason: "no email" };
  if (!smtpConfigured()) return { sent: false, reason: "Email isn't set up yet." };
  try {
    const [o] = await db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, org));
    const qr = await QRCode.toBuffer(v.token, { width: 400, margin: 1 });
    const m = visitorEmail({ visitor: v.name, host: hostName, org: o?.name ?? "Nexpreneur", date: v.visitDate, time: v.visitTime, purpose: v.purpose, code: v.token });
    await sendMail(v.email, m.subject, m.text, m.html, [{ filename: "qr.png", content: qr, cid: "visitor-qr", contentType: "image/png" }]);
    return { sent: true, reason: "" };
  } catch (e) {
    console.error("visitor email failed", e);
    return { sent: false, reason: "Couldn't send the email." };
  }
}
export async function inviteVisitor(input: z.infer<typeof inviteIn>): Promise<Result<{ token: string; emailed: boolean; emailNote: string }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = inviteIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.date < todayIST()) return { ok: false, error: "The visit date is in the past" };
  const token = crypto.randomUUID().replace(/-/g, "");
  const id = crypto.randomUUID();
  await db().insert(visitorInvites).values({ id, organizationId: s.org, hostUserId: s.uid, name: p.data.name, phone: p.data.phone || null, visitDate: p.data.date, visitTime: p.data.time, purpose: p.data.purpose || null, email: p.data.email || null, token });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "visitor.invite", entity: "visitor", entityId: id });
  const mail = await mailInvite(s.org, { name: p.data.name, email: p.data.email || null, visitDate: p.data.date, visitTime: p.data.time, purpose: p.data.purpose || null, token }, s.name);
  return { ok: true, data: { token, emailed: mail.sent, emailNote: p.data.email && !mail.sent ? mail.reason : "" } };
}

/** Re-sends an invitation email. The host or the front desk can do this. */
export async function resendInvite(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  const [row] = await db().select({ v: visitorInvites, h: users }).from(visitorInvites).innerJoin(users, eq(users.id, visitorInvites.hostUserId))
    .where(and(eq(visitorInvites.id, id), eq(visitorInvites.organizationId, s.org)));
  if (!row) return { ok: false, error: "Invitation not found" };
  if (!DESK.includes(s.role) && row.v.hostUserId !== s.uid) return { ok: false, error: "You can only resend your own invitations" };
  if (row.v.status !== "invited") return { ok: false, error: "This invitation is no longer active" };
  if (!row.v.email) return { ok: false, error: "This visitor has no email address" };
  const r = await mailInvite(s.org, { name: row.v.name, email: row.v.email, visitDate: row.v.visitDate, visitTime: row.v.visitTime, purpose: row.v.purpose, token: row.v.token }, row.h.name);
  return r.sent ? { ok: true, data: null } : { ok: false, error: r.reason };
}

const act = z.object({ id: z.string().uuid().optional(), token: z.string().regex(/^[0-9a-f]{32}$/).optional(), action: z.enum(["check_in", "check_out", "cancel"]) });
/** Reception check-in/out by row id or by scanned/typed QR code. Hosts can cancel their own invitations. */
export async function updateVisitor(input: z.infer<typeof act>): Promise<Result<{ name: string }>> {
  const s = await ctx();
  const p = act.safeParse(input);
  if (!s || !p.success || (!p.data.id && !p.data.token)) return { ok: false, error: s ? "Invalid request" : NO };
  const [v] = await db().select().from(visitorInvites).where(and(eq(visitorInvites.organizationId, s.org), p.data.id ? eq(visitorInvites.id, p.data.id) : eq(visitorInvites.token, p.data.token!)));
  if (!v) return { ok: false, error: "No invitation found for that code" };
  const desk = DESK.includes(s.role);
  if (p.data.action === "cancel") {
    if (!desk && v.hostUserId !== s.uid) return { ok: false, error: "You can only cancel your own invitations" };
    if (v.status !== "invited") return { ok: false, error: "This invitation can't be cancelled" };
    await db().update(visitorInvites).set({ status: "cancelled" }).where(eq(visitorInvites.id, v.id));
    return { ok: true, data: { name: v.name } };
  }
  if (!desk) return { ok: false, error: "Only the front desk can check visitors in or out" };
  if (p.data.action === "check_in") {
    if (v.status !== "invited") return { ok: false, error: v.status === "checked_in" ? `${v.name} is already checked in` : "This invitation isn't valid for check-in" };
    if (v.visitDate !== todayIST()) return { ok: false, error: `This invitation is for ${v.visitDate}, not today` };
    await db().update(visitorInvites).set({ status: "checked_in", checkedInAt: new Date() }).where(eq(visitorInvites.id, v.id));
    await notify(db(), { org: s.org, userId: v.hostUserId, kind: "visitor", title: `${v.name} has arrived`, body: v.purpose ?? undefined, link: "/visitors" });
  } else {
    if (v.status !== "checked_in") return { ok: false, error: "This visitor isn't checked in" };
    await db().update(visitorInvites).set({ status: "checked_out", checkedOutAt: new Date() }).where(eq(visitorInvites.id, v.id));
  }
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `visitor.${p.data.action}`, entity: "visitor", entityId: v.id });
  return { ok: true, data: { name: v.name } };
}
