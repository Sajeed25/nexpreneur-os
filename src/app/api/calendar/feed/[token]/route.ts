import { and, eq, isNull } from "drizzle-orm";
import { hasDb } from "@/lib/db/config";
import { throttled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * A private calendar feed for Google / Apple / Outlook "subscribe by URL". The long random token in the address is the
 * credential (like Google's own secret calendar addresses); the person can make a new one any time, which kills the old link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/i, "");
  if (!hasDb() || !/^[A-Za-z0-9_-]{32}$/.test(clean)) return new Response("Not found", { status: 404 });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (throttled(`cal:${ip}`, 120, 60_000)) return new Response("Too many requests", { status: 429 });
  const { db, schema } = await import("@/lib/db");
  const [u] = await db().select({ id: schema.users.id, org: schema.users.organizationId, name: schema.users.name }).from(schema.users)
    .where(and(eq(schema.users.calendarToken, clean), isNull(schema.users.deletedAt)));
  if (!u) return new Response("Not found", { status: 404 });
  const { calendarFor } = await import("@/lib/calendar");
  const { buildIcs } = await import("@/lib/ics");
  const ics = buildIcs(await calendarFor(u.id, u.org), { name: `Nexpreneur: ${u.name}` });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="nexpreneur.ics"' } });
}
