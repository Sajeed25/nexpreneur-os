import { describe, expect, it } from "vitest";
import { SLOTS, istToDate, price } from "@/lib/booking";
import { ACCESS, ROLES, can } from "@/lib/rbac";
import { makeBuckets } from "@/lib/analytics";

describe("booking pricing", () => {
  const start = istToDate("2026-10-05", "10:00");
  it("treats times as IST (UTC+5:30)", () => expect(start.toISOString()).toBe("2026-10-05T04:30:00.000Z"));
  it("prices hourly rooms by duration plus 18% GST", () => {
    const p = price({ hourlyPricePaise: 80_000, dailyPricePaise: null }, start, istToDate("2026-10-05", "12:00"));
    expect(p).toEqual({ subtotal: 160_000, tax: 28_800, total: 188_800 });
  });
  it("prices half hours", () => {
    expect(price({ hourlyPricePaise: 80_000, dailyPricePaise: null }, start, istToDate("2026-10-05", "10:30")).subtotal).toBe(40_000);
  });
  it("prices desks per day regardless of hours", () => {
    expect(price({ hourlyPricePaise: null, dailyPricePaise: 30_000 }, start, istToDate("2026-10-05", "11:00")).subtotal).toBe(30_000);
  });
  it("offers 30-minute slots from 06:00 to 22:00", () => {
    expect(SLOTS[0]).toBe("06:00");
    expect(SLOTS.at(-1)).toBe("22:00");
    expect(SLOTS).toHaveLength(33);
  });
});

describe("role access", () => {
  it("lets every role see the dashboard and its own profile", () => {
    for (const r of ROLES) { expect(can(r, "dashboard")).toBe(true); expect(can(r, "profile")).toBe(true); }
  });
  it("keeps members out of staff-only areas", () => {
    for (const s of ["members", "crm", "analytics", "settings", "locations", "resources", "calendar"] as const) expect(can("member", s)).toBe(false);
  });
  it("gives members what they need", () => {
    for (const s of ["bookings", "memberships", "payments", "invoices", "events", "community", "visitors", "ai", "support"] as const) expect(can("member", s)).toBe(true);
  });
  it("keeps money away from reception, staff and community", () => {
    for (const r of ["reception", "staff", "community_manager"] as const) { expect(can(r, "payments")).toBe(false); expect(can(r, "analytics")).toBe(false); }
  });
  it("keeps CRM and settings to owners and managers", () => {
    expect(can("finance", "crm")).toBe(false);
    expect(can("location_manager", "settings")).toBe(false);
    expect(can("owner", "settings")).toBe(true);
    expect(ACCESS.super_admin.length).toBeGreaterThanOrEqual(ACCESS.owner.length);
  });
});

describe("analytics buckets", () => {
  it.each([["today", 16], ["7d", 7], ["30d", 30], ["90d", 13]] as const)("%s has %i contiguous buckets", (range, n) => {
    const b = makeBuckets(range);
    expect(b).toHaveLength(n);
    b.forEach((x, i) => { if (i) expect(x.start).toBe(b[i - 1].end); });
  });
  it("builds month buckets from January for the year view", () => {
    const b = makeBuckets("year");
    expect(b[0].label).toBe("Jan");
    expect(b.every((x) => x.end > x.start)).toBe(true);
  });
});

import { isAllLocations, matchLocations } from "@/lib/locations";

describe("location keys", () => {
  const rows = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Nexpreneur Hyderabad", city: "Hyderabad" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Nexpreneur Warangal", city: "Warangal" },
  ];
  it("treats all / empty as every location", () => {
    expect(isAllLocations("all")).toBe(true);
    expect(isAllLocations(undefined)).toBe(true);
    expect(matchLocations(rows, "all")).toHaveLength(2);
  });
  it("matches a location by id, and only that one", () => {
    expect(matchLocations(rows, rows[1].id)).toEqual([rows[1].id]);
  });
  it("still understands the old demo keys", () => expect(matchLocations(rows, "hyd")).toEqual([rows[0].id]));
  it("matches nothing for an unknown key instead of leaking everything", () => {
    expect(matchLocations(rows, "33333333-3333-4333-8333-333333333333")).toEqual([]);
    expect(matchLocations(rows, "nonsense")).toEqual([]);
  });
});
