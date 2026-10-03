"use server";
import { hasDb } from "@/lib/db/config";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { computeAnalytics, locationIdFor, RANGES, type Analytics, type RangeKey } from "@/lib/analytics";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "analytics") && isFinance(s.role) ? s : null;
}
const NO = "Analytics is available to owners, managers and finance once the database is connected.";
const okRange = (r: string): r is RangeKey => (RANGES as string[]).includes(r);

export async function getAnalytics(range: string, loc?: string): Promise<Result<Analytics>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!okRange(range)) return { ok: false, error: "Invalid range" };
  return { ok: true, data: await computeAnalytics(s.org, range, { finance: true, locationId: await locationIdFor(s.org, loc) }) };
}

// Spreadsheet apps run text starting with = + - @ as formulas. Neutralise it, then quote.
const cell = (v: string | number) => {
  const t = String(v);
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const row = (...c: (string | number)[]) => c.map(cell).join(",");

export async function exportCsv(range: string, loc?: string): Promise<Result<{ filename: string; csv: string }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!okRange(range)) return { ok: false, error: "Invalid range" };
  const a = await computeAnalytics(s.org, range, { finance: true, locationId: await locationIdFor(s.org, loc) });
  const k = a.kpis;
  const rs = (p: number) => Math.round(p) / 100;
  const lines = [
    row("Nexpreneur OS analytics", range, loc && loc !== "all" ? `location: ${loc}` : "all locations"), "",
    row("Metric", "Value"),
    row("Collected (incl. GST, INR)", rs(k.collectedPaise)), row("MRR (INR)", rs(k.mrrPaise)), row("ARR (INR)", rs(k.arrPaise)),
    row("Active members", k.activeMembers), row("New members", k.newMembers), row("Churn %", k.churnPct), row("Bookings", k.bookings),
    row("Occupancy %", k.occupancyPct), row("Meeting room utilization %", k.roomUtilPct), row("ARPM (INR)", rs(k.arpmPaise)),
    row("Lead conversion %", k.leadConvPct), row("Membership conversion %", k.memberConvPct), row("Outstanding (INR)", rs(k.outstandingPaise)), "",
    row("Period", "Revenue (INR)", "Occupancy %", "Members", "Bookings", "Memberships ended"),
    ...a.series.revenue.map((p, i) => row(p.label, p.value, a.series.occupancy[i].value, a.series.members[i].value, a.series.bookings[i].value, a.series.ended[i].value)), "",
    row("Location", "Bookings", "Booking revenue (INR)", "Occupancy %"),
    ...a.locations.map((l) => row(l.city, l.bookings, rs(l.revenuePaise), l.occupancyPct)),
  ];
  return { ok: true, data: { filename: `nexpreneur-analytics-${range}${loc && loc !== "all" ? `-${loc}` : ""}.csv`, csv: lines.join("\r\n") } };
}
