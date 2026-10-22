import { and, eq } from "drizzle-orm";
import { hasDb } from "@/lib/db/config";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Downloads a booking (or, with ?series=1, the whole recurring series) as a calendar file. Members get their own; staff get any. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const { db, schema } = await import("@/lib/db");
  const [b] = await db().select().from(schema.bookings).where(and(eq(schema.bookings.id, id), eq(schema.bookings.organizationId, s.org)));
  if (!b || (s.role === "member" && b.userId !== s.uid)) return new Response("Not found", { status: 404 });
  let ids = [b.id];
  if (new URL(req.url).searchParams.get("series") === "1" && b.seriesId) {
    ids = (await db().select({ id: schema.bookings.id }).from(schema.bookings).where(and(eq(schema.bookings.seriesId, b.seriesId), eq(schema.bookings.status, "confirmed")))).map((r) => r.id);
  }
  const { bookingsIcs } = await import("@/lib/calendar");
  const { ics } = await bookingsIcs(ids);
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="booking.ics"', "Cache-Control": "private, no-store" } });
}
