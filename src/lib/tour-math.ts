// Shared (client + server) rules for booking a tour. All times are India Standard Time.
import { istToDate } from "@/lib/booking";
import { addDays } from "@/lib/billing";

export const TOUR_SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
/** How many tours can start in the same slot at one location (one guide each). */
export const TOUR_CAPACITY = 2;
export const TOUR_MINUTES = 45;
export const TOUR_MIN_LEAD_HOURS = 2;
export const TOUR_DAYS_AHEAD = 30;

/** Tours run Monday to Saturday. */
export const isTourDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;

/** Days a visitor can pick from: today (only while a slot is still far enough ahead) up to 30 days out, no Sundays. */
export function tourDays(now = Date.now()): string[] {
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  return Array.from({ length: TOUR_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i))
    .filter((d) => isTourDay(d) && TOUR_SLOTS.some((t) => !tourSlotProblem(d, t, now)));
}

/** Null when the slot can be booked, otherwise a plain-words reason. */
export function tourSlotProblem(date: string, time: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TOUR_SLOTS.includes(time)) return "Pick one of the available times.";
  if (!isTourDay(date)) return "Tours aren't available on Sundays.";
  const start = istToDate(date, time).getTime();
  if (isNaN(start)) return "Pick one of the available times.";
  if (start < now + TOUR_MIN_LEAD_HOURS * 3_600_000) return `Please pick a time at least ${TOUR_MIN_LEAD_HOURS} hours from now.`;
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  if (date > addDays(today, TOUR_DAYS_AHEAD)) return `Tours can be booked up to ${TOUR_DAYS_AHEAD} days ahead.`;
  return null;
}

export const tourEnd = (date: string, time: string) => new Date(istToDate(date, time).getTime() + TOUR_MINUTES * 60_000);
