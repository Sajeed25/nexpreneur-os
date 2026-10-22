import { hasDb } from "@/lib/db/config";
import { safeEq } from "@/lib/payments-server";

/** Shared guard for the scheduled endpoints: needs CRON_SECRET and a database. Returns a Response to send back, or null when the call may proceed. */
export function cronGuard(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "placeholder" || secret.length < 16 || !hasDb()) return new Response("Not configured", { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!safeEq(given, secret)) return new Response("Unauthorized", { status: 401 });
  return null;
}

/** A short, non-sensitive code for a failed job, so a failing schedule is easy to diagnose (e.g. ER_BAD_FIELD_ERROR = run the latest SQL file). */
export function errorCode(e: unknown) {
  const o = e as { code?: string; cause?: { code?: string }; name?: string };
  return o.code ?? o.cause?.code ?? o.name ?? "unknown";
}
