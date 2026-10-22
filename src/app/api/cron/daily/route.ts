import { cronGuard, errorCode } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs one job and reports its result; a failing job is reported but doesn't stop the others. */
async function job<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) { console.error(`daily job "${name}" failed`, e); return { error: errorCode(e) }; }
}

/**
 * Daily job: renewal invoices, payment reminders, plan credits, waitlist housekeeping, weekly reports and the outbox.
 * Call it once a day with:  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
 * It is safe to call more than once; every job claims its work under locks.
 */
async function run(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const jobs = await import("@/lib/daily-jobs");
  const renewals = await job("renewals", () => jobs.runRenewals());
  const reminders = await job("reminders", () => jobs.runReminders());
  const credits = await job("credits", () => jobs.runCreditGrants());
  const waitlistClosed = await job("waitlist", async () => (await import("@/lib/waitlist")).expireWaitlist());
  const weeklyReports = await job("weeklyReports", async () => (await import("@/lib/reports")).runWeeklyReports());
  const outbox = await job("outbox", async () => (await import("@/lib/messaging")).drainOutbox(100));
  const results = { renewals, reminders, credits, waitlistClosed, weeklyReports, outbox };
  const failed = Object.entries(results).filter(([, v]) => v && typeof v === "object" && "error" in v).map(([k]) => k);
  return Response.json({ ok: failed.length === 0, failed, ...results }, { status: failed.length ? 500 : 200 });
}

export const GET = run;
export const POST = run;
