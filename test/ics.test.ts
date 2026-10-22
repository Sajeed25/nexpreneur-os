import { describe, expect, it } from "vitest";
import { buildIcs, fold, googleCalendarUrl, icsDate, icsText, outlookCalendarUrl } from "@/lib/ics";

const e = { uid: "booking-123@nexpreneur", title: "Meeting Room B", start: new Date("2026-10-24T04:30:00Z"), end: new Date("2026-10-24T06:30:00Z") };

describe("ics text", () => {
  it("formats UTC dates", () => expect(icsDate(e.start)).toBe("20261024T043000Z"));
  it("escapes special characters", () => expect(icsText("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE"));
});

describe("line folding", () => {
  it("leaves short lines alone", () => expect(fold("SUMMARY:Hello")).toBe("SUMMARY:Hello"));
  it("folds long lines at 75 bytes with a leading space", () => {
    const f = fold("DESCRIPTION:" + "x".repeat(200));
    const parts = f.split("\r\n");
    expect(parts[0].length).toBe(75);
    expect(parts.slice(1).every((p) => p.startsWith(" ") && p.length <= 75)).toBe(true);
    expect(parts.join("").replace(/ /g, "")).toBe("DESCRIPTION:" + "x".repeat(200));
  });
  it("never splits a multi-byte character", () => {
    const f = fold("SUMMARY:" + "₹".repeat(60)); // 3 bytes each
    for (const p of f.split("\r\n")) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(f.replace(/\r\n /g, "")).toBe("SUMMARY:" + "₹".repeat(60));
  });
});

describe("calendar file", () => {
  const ics = buildIcs([{ ...e, description: "6 people\nBring a laptop", location: "Nexpreneur Hyderabad", url: "https://os.example/bookings", remindMinutes: 30 }], { name: "Nexpreneur" });
  it("is a well-formed calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
  it("carries the event details", () => {
    expect(ics).toContain("UID:booking-123@nexpreneur");
    expect(ics).toContain("DTSTART:20261024T043000Z");
    expect(ics).toContain("DTEND:20261024T063000Z");
    expect(ics).toContain("SUMMARY:Meeting Room B");
    expect(ics).toContain("DESCRIPTION:6 people\\nBring a laptop");
    expect(ics).toContain("LOCATION:Nexpreneur Hyderabad");
    expect(ics).toContain("TRIGGER:-PT30M");
  });
  it("can cancel an event it sent before", () => {
    const c = buildIcs([{ ...e, status: "CANCELLED", remindMinutes: 30, sequence: 1 }], { method: "CANCEL" });
    expect(c).toContain("METHOD:CANCEL");
    expect(c).toContain("STATUS:CANCELLED");
    expect(c).toContain("SEQUENCE:1");
    expect(c).not.toContain("VALARM");
  });
  it("makes add-to-calendar links", () => {
    expect(googleCalendarUrl({ ...e })).toContain("dates=20261024T043000Z%2F20261024T063000Z");
    expect(outlookCalendarUrl({ ...e })).toContain("subject=Meeting+Room+B");
  });
});
