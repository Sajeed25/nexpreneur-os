import { describe, expect, it } from "vitest";
import { istToDate } from "@/lib/booking";
import { applyCredits, currentCycleStart, fmtMinutes, grantDue, weeklyDates } from "@/lib/credit-math";

const room = { kind: "meeting_room", hourlyPricePaise: 80_000, dailyPricePaise: null };
const desk = { kind: "hot_desk", hourlyPricePaise: null, dailyPricePaise: 30_000 };
const at = (a: string, b: string) => [istToDate("2026-10-05", a), istToDate("2026-10-05", b)] as const;

describe("credits on bookings", () => {
  it("charges full price with no credits", () => {
    const q = applyCredits(room, ...at("10:00", "12:00"), { minutes: 0, passes: 0 });
    expect(q).toMatchObject({ creditMinutes: 0, subtotal: 160_000, tax: 28_800, total: 188_800, listTotal: 188_800 });
  });
  it("covers a booking completely when the balance is enough", () => {
    const q = applyCredits(room, ...at("10:00", "12:00"), { minutes: 600, passes: 0 });
    expect(q).toMatchObject({ creditMinutes: 120, subtotal: 0, tax: 0, total: 0, listTotal: 188_800 });
  });
  it("uses what is left and charges GST only on the remainder", () => {
    const q = applyCredits(room, ...at("10:00", "12:00"), { minutes: 90, passes: 0 });
    expect(q.creditMinutes).toBe(90);
    expect(q.subtotal).toBe(40_000); // 30 minutes at 800/hr
    expect(q.tax).toBe(7_200);
    expect(q.total).toBe(47_200);
  });
  it("uses one day pass for a hot desk, whatever the hours", () => {
    const q = applyCredits(desk, ...at("09:00", "13:00"), { minutes: 0, passes: 2 });
    expect(q).toMatchObject({ creditPasses: 1, creditMinutes: 0, total: 0, listTotal: 35_400 });
  });
  it("does not spend room minutes on a desk or passes on a room", () => {
    expect(applyCredits(desk, ...at("09:00", "13:00"), { minutes: 600, passes: 0 }).total).toBe(35_400);
    expect(applyCredits(room, ...at("10:00", "11:00"), { minutes: 0, passes: 5 }).total).toBe(94_400);
  });
  it("never uses a negative balance", () => {
    expect(applyCredits(room, ...at("10:00", "11:00"), { minutes: -30, passes: -1 }).total).toBe(94_400);
  });
});

describe("credit cycles", () => {
  it("is null before the membership starts", () => expect(currentCycleStart("2026-11-01", 1, "2026-10-17")).toBeNull());
  it("is the start date during the first cycle", () => expect(currentCycleStart("2026-10-05", 1, "2026-10-17")).toBe("2026-10-05"));
  it("moves forward each cycle", () => expect(currentCycleStart("2026-01-31", 1, "2026-10-17")).toBe("2026-09-30"));
  it("handles quarterly and yearly cycles", () => {
    expect(currentCycleStart("2026-01-10", 3, "2026-10-17")).toBe("2026-10-10");
    expect(currentCycleStart("2025-03-01", 12, "2026-10-17")).toBe("2026-03-01");
  });
  it("grants once per cycle", () => {
    expect(grantDue("2026-10-05", null)).toBe(true);
    expect(grantDue("2026-10-05", "2026-10-05")).toBe(false);
    expect(grantDue("2026-11-05", "2026-10-05")).toBe(true);
    expect(grantDue(null, null)).toBe(false);
  });
});

describe("recurring dates", () => {
  it("repeats weekly on the same weekday", () => expect(weeklyDates("2026-10-05", 3)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]));
  it("crosses month and year ends", () => expect(weeklyDates("2026-12-29", 2)).toEqual(["2026-12-29", "2027-01-05"]));
  it("caps at 12 weeks and at least 1", () => {
    expect(weeklyDates("2026-10-05", 99)).toHaveLength(12);
    expect(weeklyDates("2026-10-05", 0)).toEqual(["2026-10-05"]);
  });
});

describe("fmtMinutes", () => {
  it("reads naturally", () => { expect(fmtMinutes(90)).toBe("1h 30m"); expect(fmtMinutes(120)).toBe("2h"); expect(fmtMinutes(45)).toBe("45m"); });
});
