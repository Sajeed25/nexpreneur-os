import { hasDb } from "@/lib/db/config";
import { safeEq } from "@/lib/payments-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily job: renewal invoices + payment reminders.
 * Call it once a day with:  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
 * It is safe to call more than once; renewals and reminders are claimed under locks.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "placeholder" || secret.length < 16 || !hasDb()) return new Response("Not configured", { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!safeEq(given, secret)) return new Response("Unauthorized", { status: 401 });

  try {
    const { runRenewals, runReminders } = await import("@/lib/daily-jobs");
    const renewals = await runRenewals();
    const reminders = await runReminders();
    return Response.json({ ok: true, renewals, reminders });
  } catch (e) {
    // Report a short code (no secrets) so a failing schedule is easy to diagnose, e.g. ER_BAD_FIELD_ERROR = run the latest SQL file.
    const o = e as { code?: string; cause?: { code?: string }; name?: string };
    console.error("daily job failed", e);
    return Response.json({ ok: false, error: o.code ?? o.cause?.code ?? o.name ?? "unknown" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
