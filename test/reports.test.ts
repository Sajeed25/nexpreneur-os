import { describe, expect, it } from "vitest";
import { isMonday, previousWeek, weekLabel, weekday } from "@/lib/report-math";

describe("weeks", () => {
  it("knows the weekday of a date", () => { expect(weekday("2026-10-21")).toBe(3); expect(isMonday("2026-10-19")).toBe(true); expect(isMonday("2026-10-20")).toBe(false); });
  it("on a Monday, reports the week that just ended", () => {
    expect(previousWeek("2026-10-19")).toMatchObject({ start: "2026-10-12", end: "2026-10-18", prevStart: "2026-10-05", prevEnd: "2026-10-11" });
  });
  it("mid-week, still means the last full week", () => expect(previousWeek("2026-10-21")).toMatchObject({ start: "2026-10-12", end: "2026-10-18" }));
  it("on a Sunday, the last full week is the one before", () => expect(previousWeek("2026-10-25")).toMatchObject({ start: "2026-10-12", end: "2026-10-18" }));
  it("crosses month and year ends", () => {
    expect(previousWeek("2026-10-05")).toMatchObject({ start: "2026-09-28", end: "2026-10-04", label: "28 Sep - 4 Oct 2026" });
    expect(previousWeek("2027-01-05")).toMatchObject({ start: "2026-12-28", end: "2027-01-03", label: "28 Dec 2026 - 3 Jan 2027" });
  });
  it("labels a normal week", () => expect(weekLabel("2026-10-12", "2026-10-18")).toBe("12-18 Oct 2026"));
});
