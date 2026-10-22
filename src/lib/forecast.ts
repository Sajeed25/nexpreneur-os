import "server-only";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CLOSE_HOUR, OPEN_HOUR, todayIST } from "@/lib/booking";
import { addDays } from "@/lib/billing";
import { forecastOccupancy, type DayLoad, type Forecast } from "@/lib/forecast-math";

const { bookings, resources } = schema;
const DAY = 86_400_000, IST = 330 * 60_000;
const dayStart = (date: string) => new Date(`${date}T00:00:00Z`).getTime() - IST;

/** Daily occupancy (booked hours as a share of open hours across all resources) for the last `days` days, ending yesterday. */
export async function occupancyHistory(org: string, locationId: string | null, days = 56, today = todayIST()): Promise<DayLoad[]> {
  const d = db();
  const first = addDays(today, -days);
  const res = await d.select({ id: resources.id }).from(resources).where(and(eq(resources.organizationId, org), isNull(resources.deletedAt), locationId ? eq(resources.locationId, locationId) : undefined));
  if (!res.length) return [];
  const from = new Date(dayStart(first)), to = new Date(dayStart(today));
  const rows = await d.select({ s: bookings.startsAt, e: bookings.endsAt }).from(bookings)
    .where(and(eq(bookings.organizationId, org), inArray(bookings.status, ["confirmed", "completed"]), gte(bookings.endsAt, from), lt(bookings.startsAt, to), locationId ? eq(bookings.locationId, locationId) : undefined)).limit(40_000);
  const capacity = res.length * (CLOSE_HOUR - OPEN_HOUR);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(first, i), a = dayStart(date), b = a + DAY;
    const hours = rows.reduce((sum, r) => sum + Math.max(0, Math.min(r.e.getTime(), b) - Math.max(r.s.getTime(), a)) / 3_600_000, 0);
    return { date, pct: Math.min(100, Math.round((hours / capacity) * 100)) };
  });
}

export async function loadForecast(org: string, locationId: string | null, today = todayIST()): Promise<Forecast> {
  return forecastOccupancy(await occupancyHistory(org, locationId, 56, today), today, 14);
}
