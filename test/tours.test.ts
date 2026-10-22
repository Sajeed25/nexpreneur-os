import { describe, expect, it } from "vitest";
import { TOUR_CAPACITY, TOUR_SLOTS, isTourDay, tourDays, tourEnd, tourSlotProblem } from "@/lib/tour-math";
import { tourToken, verifyTourToken } from "@/lib/tours";

// 2026-10-21 is a Wednesday. "now" below is 10:00 IST on that day.
const NOW = Date.parse("2026-10-21T10:00:00+05:30");

describe("tour days", () => {
  it("skips Sundays", () => {
    expect(isTourDay("2026-10-24")).toBe(true); // Saturday
    expect(isTourDay("2026-10-25")).toBe(false); // Sunday
  });
  it("offers about a month of days, none of them Sundays, starting today", () => {
    const days = tourDays(NOW);
    expect(days[0]).toBe("2026-10-21");
    expect(days.length).toBeGreaterThan(25);
    expect(days.every(isTourDay)).toBe(true);
  });
  it("drops today once no slot is far enough ahead", () => {
    const late = Date.parse("2026-10-21T15:00:00+05:30"); // the last slot (16:00) is under 2 hours away
    expect(tourDays(late)[0]).toBe("2026-10-22");
  });
  it("skips Sunday when it would otherwise be next", () => expect(tourDays(Date.parse("2026-10-24T17:00:00+05:30"))[0]).toBe("2026-10-26"));
});

describe("tour slots", () => {
  it("accepts a normal slot", () => expect(tourSlotProblem("2026-10-22", "11:00", NOW)).toBeNull());
  it("needs a couple of hours notice", () => {
    expect(tourSlotProblem("2026-10-21", "11:00", NOW)).toMatch(/at least 2 hours/);
    expect(tourSlotProblem("2026-10-21", "13:00", NOW)).toBeNull();
  });
  it("refuses the past, Sundays, odd times and far-future dates", () => {
    expect(tourSlotProblem("2026-10-20", "11:00", NOW)).not.toBeNull();
    expect(tourSlotProblem("2026-10-25", "11:00", NOW)).toMatch(/Sundays/);
    expect(tourSlotProblem("2026-10-22", "11:30", NOW)).toMatch(/available times/);
    expect(tourSlotProblem("not-a-date", "11:00", NOW)).toMatch(/available times/);
    expect(tourSlotProblem("2027-03-01", "11:00", NOW)).toMatch(/30 days/);
  });
  it("has hourly slots in the daytime and room for two guides", () => {
    expect(TOUR_SLOTS[0]).toBe("10:00");
    expect(TOUR_SLOTS.at(-1)).toBe("16:00");
    expect(TOUR_CAPACITY).toBe(2);
  });
  it("lasts 45 minutes", () => expect(tourEnd("2026-10-22", "11:00").toISOString()).toBe("2026-10-22T06:15:00.000Z"));
});

describe("cancel links", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("round-trips", () => expect(verifyTourToken(tourToken(id))).toBe(id));
  it("rejects a tampered or foreign token", () => {
    const t = tourToken(id);
    expect(verifyTourToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyTourToken("99999999-2222-3333-4444-555555555555." + t.split(".")[1])).toBeNull();
    expect(verifyTourToken("nonsense")).toBeNull();
    expect(verifyTourToken("")).toBeNull();
  });
});
