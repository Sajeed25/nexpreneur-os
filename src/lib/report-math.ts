// Shared (client + server) date rules for the weekly report. Dates are IST calendar dates ("YYYY-MM-DD").
import { addDays } from "@/lib/billing";

/** 0 = Sunday ... 6 = Saturday, for a calendar date. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isMonday = (date: string) => weekday(date) === 1;

export type Week = { start: string; end: string; prevStart: string; prevEnd: string; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const part = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) });

/** "13-19 Oct 2026", "28 Sep - 4 Oct 2026" or "29 Dec 2026 - 4 Jan 2027". */
export function weekLabel(start: string, end: string) {
  const a = part(start), b = part(end);
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} - ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} - ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}-${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** The last full Monday-to-Sunday week before `today`, and the week before that (for comparison). */
export function previousWeek(today: string): Week {
  const thisMonday = addDays(today, -((weekday(today) + 6) % 7));
  const start = addDays(thisMonday, -7), end = addDays(thisMonday, -1);
  return { start, end, prevStart: addDays(start, -7), prevEnd: addDays(start, -1), label: weekLabel(start, end) };
}
