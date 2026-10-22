import "server-only";
import { and, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CLOSE_HOUR, OPEN_HOUR, todayIST } from "@/lib/booking";
import { addDays } from "@/lib/billing";
import { appUrl, sendMail, smtpConfigured } from "@/lib/mailer";
import { weeklyReportEmail, type WeeklyReport } from "@/lib/emails-growth";
import { isMonday, previousWeek, type Week } from "@/lib/report-math";
import { istStart } from "@/lib/exports";

const { payments, users, bookings, resources, invoices, memberships, refundRequests, organizations, reportRuns } = schema;

/** Who gets the money figures: the same roles that can see finance in the app. */
export const REPORT_ROLES = ["super_admin", "owner", "location_manager", "finance"] as const;

/** One week of numbers for the whole organisation. Everything is counted in IST days, Monday to Sunday. */
export async function buildWeeklyReport(org: string, w: Week, today = todayIST()): Promise<WeeklyReport> {
  const d = db();
  const [o] = await d.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, org));
  const range = (a: string, b: string) => [istStart(a), istStart(addDays(b, 1))] as const;
  const [s1, e1] = range(w.start, w.end), [s0, e0] = range(w.prevStart, w.prevEnd);

  const cash = async (a: Date, b: Date) => {
    const [r] = await d.select({ v: sql<number>`coalesce(sum(${payments.amountPaise} - ${payments.refundedPaise}), 0)` }).from(payments)
      .where(and(eq(payments.organizationId, org), eq(payments.status, "captured"), notInArray(payments.method, ["tds", "credit_note"]), gte(payments.createdAt, a), lt(payments.createdAt, b)));
    return Number(r.v);
  };
  const members = async (a: Date, b: Date) => {
    const [r] = await d.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.organizationId, org), eq(users.role, "member"), isNull(users.deletedAt), gte(users.createdAt, a), lt(users.createdAt, b)));
    return Number(r.n);
  };
  const books = async (a: Date, b: Date) => {
    const [r] = await d.select({ n: sql<number>`count(*)` }).from(bookings).where(and(eq(bookings.organizationId, org), inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.startsAt, a), lt(bookings.startsAt, b)));
    return Number(r.n);
  };

  const rows = await d.select({ s: bookings.startsAt, e: bookings.endsAt }).from(bookings)
    .where(and(eq(bookings.organizationId, org), inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.endsAt, s1), lt(bookings.startsAt, e1))).limit(20_000);
  const [{ n: nRes }] = await d.select({ n: sql<number>`count(*)` }).from(resources).where(and(eq(resources.organizationId, org), isNull(resources.deletedAt)));
  const hours = rows.reduce((a, r) => a + Math.max(0, Math.min(r.e.getTime(), e1.getTime()) - Math.max(r.s.getTime(), s1.getTime())) / 3_600_000, 0);
  const capacity = Number(nRes) * 7 * (CLOSE_HOUR - OPEN_HOUR);

  const [owed] = await d.select({ v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices).where(and(eq(invoices.organizationId, org), inArray(invoices.status, ["unpaid", "partial"])));
  const [over] = await d.select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices)
    .where(and(eq(invoices.organizationId, org), inArray(invoices.status, ["unpaid", "partial"]), lt(invoices.dueDate, today)));
  const [ren] = await d.select({ n: sql<number>`count(*)` }).from(memberships).where(and(eq(memberships.organizationId, org), eq(memberships.status, "active"), gte(memberships.renewalDate, today), lt(memberships.renewalDate, addDays(today, 8))));
  const [ref] = await d.select({ n: sql<number>`count(*)` }).from(refundRequests).where(and(eq(refundRequests.organizationId, org), eq(refundRequests.status, "pending")));
  const base = appUrl();

  return {
    org: o?.name ?? "Nexpreneur", weekLabel: w.label,
    revenuePaise: await cash(s1, e1), prevRevenuePaise: await cash(s0, e0), newMembers: await members(s1, e1), prevNewMembers: await members(s0, e0),
    bookings: await books(s1, e1), prevBookings: await books(s0, e0), occupancyPct: capacity > 0 ? Math.min(100, Math.round((hours / capacity) * 100)) : 0,
    outstandingPaise: Number(owed.v), overdueCount: Number(over.n), overduePaise: Number(over.v), renewalsNext7: Number(ren.n), refundsPending: Number(ref.n),
    link: base ? `${base}/dashboard` : null,
  };
}

async function send(u: { id: string; name: string; email: string; org: string }, report: WeeklyReport) {
  const m = weeklyReportEmail(report);
  await sendMail(u.email, m.subject, m.text, m.html);
}

/**
 * Monday morning: emails last week's report to every owner, manager and finance person who turned it on. Run from the daily job;
 * a person is only sent a given week once. On other days it does nothing.
 */
export async function runWeeklyReports(today = todayIST(), opts: { force?: boolean } = {}) {
  if (!opts.force && !isMonday(today)) return { skipped: "not Monday", sent: 0, errors: 0 };
  if (!smtpConfigured()) return { skipped: "email isn't set up", sent: 0, errors: 0 };
  const w = previousWeek(today);
  const people = await db().select({ id: users.id, name: users.name, email: users.email, org: users.organizationId }).from(users)
    .where(and(eq(users.weeklyReport, true), inArray(users.role, [...REPORT_ROLES]), isNull(users.deletedAt)));
  const cache = new Map<string, WeeklyReport>();
  let sent = 0, errors = 0;
  for (const u of people) {
    try {
      // Claim the week for this person first, so a second run (or a second server) can't send it twice.
      try { await db().insert(reportRuns).values({ userId: u.id, weekStart: w.start }); }
      catch (e) { if (((e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code) === "ER_DUP_ENTRY") continue; throw e; } // already sent this week
      let rep = cache.get(u.org);
      if (!rep) { rep = await buildWeeklyReport(u.org, w, today); cache.set(u.org, rep); }
      await send(u, rep);
      sent++;
    } catch (e) {
      errors++;
      console.error("weekly report failed for", u.id, e);
      await db().delete(reportRuns).where(and(eq(reportRuns.userId, u.id), eq(reportRuns.weekStart, w.start))); // let the next run try again
    }
  }
  return { week: w.label, sent, errors };
}

/** "Send me this now": last week's report to one person, any day. Doesn't count as the Monday send. */
export async function sendReportNow(user: { id: string; name: string; email: string; org: string }, today = todayIST()) {
  if (!smtpConfigured()) return { ok: false as const, error: "Email isn't set up on this server yet." };
  const rep = await buildWeeklyReport(user.org, previousWeek(today), today);
  await send(user, rep);
  return { ok: true as const, week: rep.weekLabel };
}
