import { cronGuard, errorCode } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends queued WhatsApp / SMS / push messages. Messages are normally sent right after the action that created them;
 * this is the safety net that retries failures. Call it every few minutes:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/outbox
 */
async function run(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  try {
    const { drainOutbox } = await import("@/lib/messaging");
    return Response.json({ ok: true, ...(await drainOutbox(100)) });
  } catch (e) {
    console.error("outbox job failed", e);
    return Response.json({ ok: false, error: errorCode(e) }, { status: 500 });
  }
}
export const GET = run;
export const POST = run;
