import { describe, expect, it } from "vitest";
import { MIN_HISTORY_DAYS, forecastOccupancy, type DayLoad } from "@/lib/forecast-math";
import { addDays } from "@/lib/billing";
import { weekday } from "@/lib/report-math";

const TODAY = "2026-10-21"; // a Wednesday
/** 8 weeks of history ending yesterday, with a load that depends on the weekday. */
const hist = (f: (date: string, wd: number) => number, days = 56): DayLoad[] =>
  Array.from({ length: days }, (_, i) => { const date = addDays(TODAY, -(days - i)); return { date, pct: f(date, weekday(date)) }; });

describe("occupancy forecast", () => {
  it("repeats a steady weekly pattern", () => {
    const f = forecastOccupancy(hist((_, wd) => (wd === 0 ? 5 : wd === 6 ? 20 : 60)), TODAY, 14);
    expect(f.days).toHaveLength(14);
    expect(f.days[0]).toMatchObject({ date: TODAY, weekday: 3, pct: 60 });
    expect(f.days.find((d) => d.weekday === 0)!.pct).toBe(5);
    expect(f.days.find((d) => d.weekday === 6)!.pct).toBe(20);
    expect(f.trend).toBe(1);
    expect(f.enough).toBe(true);
  });
  it("names the busiest and quietest days", () => {
    const f = forecastOccupancy(hist((_, wd) => (wd === 2 ? 90 : wd === 0 ? 2 : 50)), TODAY);
    expect(f.busiest).toMatchObject({ weekday: 2, pct: 90 });
    expect(f.quietest).toMatchObject({ weekday: 0, pct: 2 });
  });
  it("leans up when the last fortnight ran busier, within limits", () => {
    const f = forecastOccupancy(hist((d) => (d >= addDays(TODAY, -14) ? 70 : 50)), TODAY);
    expect(f.trend).toBe(1.25); // 70/50 = 1.4, held at the cap
    expect(f.days[0].pct).toBeGreaterThan(55);
  });
  it("leans down when it ran quieter", () => {
    const f = forecastOccupancy(hist((d) => (d >= addDays(TODAY, -14) ? 20 : 60)), TODAY);
    expect(f.trend).toBe(0.8);
  });
  it("never goes outside 0-100% and keeps an uncertainty band", () => {
    const f = forecastOccupancy(hist((d, wd) => (wd === 1 ? 100 : 0) + (d.endsWith("5") ? 0 : 0)), TODAY);
    for (const d of f.days) { expect(d.pct).toBeGreaterThanOrEqual(0); expect(d.pct).toBeLessThanOrEqual(100); expect(d.low).toBeLessThanOrEqual(d.pct); expect(d.high).toBeGreaterThanOrEqual(d.pct); }
  });
  it("widens the band when the history is jumpy", () => {
    const steady = forecastOccupancy(hist(() => 50), TODAY).days[0];
    // Wednesdays swing between 20, 45 and 70 from week to week
    const jumpy = forecastOccupancy(hist((d, wd) => (wd === 3 ? 20 + (Math.floor(Date.parse(d) / 604_800_000) % 3) * 25 : 50)), TODAY).days[0];
    expect(jumpy.high - jumpy.low).toBeGreaterThan(steady.high - steady.low);
  });
  it("won't pretend with too little history", () => {
    const f = forecastOccupancy(hist(() => 50, MIN_HISTORY_DAYS - 1), TODAY);
    expect(f.enough).toBe(false);
    expect(f.busiest).toBeNull();
  });
  it("copes with no history at all", () => {
    const f = forecastOccupancy([], TODAY, 7);
    expect(f.days).toHaveLength(7);
    expect(f.days.every((d) => d.pct === 0)).toBe(true);
    expect(f.enough).toBe(false);
  });
  it("ignores today and the future in the history", () => {
    const f = forecastOccupancy([...hist(() => 40), { date: TODAY, pct: 100 }, { date: addDays(TODAY, 3), pct: 100 }], TODAY);
    expect(f.days[0].pct).toBe(40);
  });
});
