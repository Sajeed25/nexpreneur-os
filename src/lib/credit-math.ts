// Shared (client + server) rules for plan credits and recurring bookings. No database access here, so it is easy to test.
import { GST_PCT, price } from "@/lib/booking";
import { addDays, addMonths } from "@/lib/billing";

/** Room-hour credits apply to hourly spaces of these kinds; day passes apply to these daily-priced kinds. */
export const MINUTE_KINDS: string[] = ["meeting_room", "phone_booth"];
export const PASS_KINDS: string[] = ["hot_desk"];

export type Balance = { minutes: number; passes: number };
export type Priced = { kind: string; hourlyPricePaise: number | null; dailyPricePaise: number | null };

export type CreditQuote = {
  creditMinutes: number; creditPasses: number;
  listTotal: number; subtotal: number; tax: number; total: number;
};

/** Price of a booking after drawing down the member's credits. Credits cover the cost before GST; GST is charged on what's left. */
export function applyCredits(r: Priced, start: Date, end: Date, bal: Balance): CreditQuote {
  const list = price(r, start, end);
  let subtotal = list.subtotal, creditMinutes = 0, creditPasses = 0;
  if (MINUTE_KINDS.includes(r.kind) && r.hourlyPricePaise != null && bal.minutes > 0) {
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);
    creditMinutes = Math.min(Math.max(0, bal.minutes), durationMin);
    subtotal = Math.round((r.hourlyPricePaise * (durationMin - creditMinutes)) / 60);
  } else if (PASS_KINDS.includes(r.kind) && r.dailyPricePaise != null && bal.passes >= 1) {
    creditPasses = 1;
    subtotal = 0;
  }
  const tax = Math.round((subtotal * GST_PCT) / 100);
  return { creditMinutes, creditPasses, listTotal: list.total, subtotal, tax, total: subtotal + tax };
}

/** Start of the billing cycle that contains `today`, counting from the membership start date. Null before the membership starts. */
export function currentCycleStart(startDate: string, cycleMonths: number, today: string): string | null {
  if (startDate > today) return null;
  const step = Math.max(1, cycleMonths);
  let cur = startDate;
  for (let k = 1; k < 600; k++) {
    const next = addMonths(startDate, k * step);
    if (next > today) break;
    cur = next;
  }
  return cur;
}

/** Credits are granted once per cycle: when the current cycle started after the last one we granted for. */
export const grantDue = (cycleStart: string | null, lastGranted: string | null) => !!cycleStart && (!lastGranted || cycleStart > lastGranted);

export const MAX_REPEAT_WEEKS = 12;
/** The same weekday for `count` weeks, starting at `date` (YYYY-MM-DD). */
export function weeklyDates(date: string, count: number): string[] {
  const n = Math.min(MAX_REPEAT_WEEKS, Math.max(1, Math.floor(count) || 1));
  return Array.from({ length: n }, (_, i) => addDays(date, i * 7));
}

export const fmtMinutes = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
};
