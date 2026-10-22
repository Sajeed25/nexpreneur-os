// Occupancy forecast from booking history. Deliberately simple and explainable: each weekday's typical load over the last
// few weeks, nudged by whether the last two weeks ran busier or quieter than the weeks before. No model to train.
import { addDays } from "@/lib/billing";
import { weekday } from "@/lib/report-math";

export type DayLoad = { date: string; pct: number };
export type ForecastDay = { date: string; weekday: number; pct: number; low: number; high: number };
export type Forecast = {
  days: ForecastDay[]; trend: number; basis: number;
  /** Plain-words summary pieces for the screen. */
  busiest: ForecastDay | null; quietest: ForecastDay | null; average: number; enough: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

/** Fewer than this many days of history and a forecast would be guesswork. */
export const MIN_HISTORY_DAYS = 21;

export function forecastOccupancy(history: DayLoad[], today: string, horizon = 14): Forecast {
  const past = history.filter((h) => h.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const enough = past.length >= MIN_HISTORY_DAYS;
  const all = past.map((h) => h.pct);
  // Trend: the last 14 days against the 28 before them, held within a believable range.
  const recent = past.slice(-14).map((h) => h.pct), earlier = past.slice(-42, -14).map((h) => h.pct);
  const trend = earlier.length >= 7 && mean(earlier) > 0 ? clamp(mean(recent) / mean(earlier), 0.8, 1.25) : 1;

  const byDay = new Map<number, number[]>();
  for (const h of past.slice(-56)) { const w = weekday(h.date); byDay.set(w, [...(byDay.get(w) ?? []), h.pct]); }

  const days: ForecastDay[] = Array.from({ length: horizon }, (_, i) => {
    const date = addDays(today, i), w = weekday(date);
    const obs = byDay.get(w) ?? [];
    const base = obs.length >= 3 ? mean(obs) : mean(all); // too few of that weekday: fall back to the overall average
    const pct = clamp(Math.round(base * trend), 0, 100);
    const band = Math.max(5, Math.round(sd(obs.length >= 3 ? obs : all)));
    return { date, weekday: w, pct, low: clamp(pct - band, 0, 100), high: clamp(pct + band, 0, 100) };
  });
  const sorted = [...days].sort((a, b) => b.pct - a.pct);
  return { days, trend: Math.round(trend * 100) / 100, basis: past.length, busiest: enough ? sorted[0] ?? null : null, quietest: enough ? sorted[sorted.length - 1] ?? null : null, average: Math.round(mean(days.map((d) => d.pct))), enough };
}
