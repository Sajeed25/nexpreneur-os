"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
import { AreaSeries, BarSeries, ChartCard, LineSeries, compactInr } from "@/components/charts";
import type { Analytics } from "@/lib/analytics";
import { rupees } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { useLocation } from "@/components/shell/app-shell";
import { exportCsv, getAnalytics } from "./actions";

const RANGES = [["7d", "7 Days"], ["30d", "30 Days"], ["90d", "90 Days"], ["year", "This Year"]] as const;

export function AnalyticsApp() {
  const { loc } = useLocation();
  const [range, setRange] = React.useState<string>("30d");
  const [a, setA] = React.useState<Analytics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    getAnalytics(range, loc).then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setA(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load analytics."); } });
    return () => { live = false; };
  }, [range, loc]);

  const download = async () => {
    setExporting(true);
    const r = await exportCsv(range, loc);
    setExporting(false);
    if (!r.ok) { setError(r.error); return; }
    const url = URL.createObjectURL(new Blob(["﻿" + r.data.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = r.data.filename;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };

  const k = a?.kpis;
  const tiles: [string, string, string?][] = k ? [
    ["Revenue collected", rupees(k.collectedPaise), "incl. GST"], ["MRR", rupees(k.mrrPaise), "excl. GST"], ["ARR", rupees(k.arrPaise), "MRR × 12"],
    ["Active members", String(k.activeMembers), "on an active plan"], ["New members", String(k.newMembers)], ["Churn", `${k.churnPct}%`, "memberships ended"],
    ["Bookings", String(k.bookings)], ["Occupancy", `${k.occupancyPct}%`, "booked hours ÷ open hours"], ["Room utilization", `${k.roomUtilPct}%`, "meeting rooms"],
    ["Avg revenue / member", rupees(k.arpmPaise), "monthly"], ["Lead conversion", `${k.leadConvPct}%`, "won ÷ new leads"], ["Membership conversion", `${k.memberConvPct}%`, "members with a plan"],
  ] : [];

  return (
    <>
      <PageHeader title="Analytics" sub="How your spaces are performing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Date range" className="flex gap-1 rounded-xl border bg-surface p-1">
              {RANGES.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={range === id} onClick={() => setRange(id)} className={cn("h-8 rounded-lg px-3 text-sm", range === id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{label}</button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={download} disabled={exporting || !a}><Download size={16} />{exporting ? "Preparing…" : "Export CSV"}</Button>
          </div>
        } />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && !a && <p className="text-sm text-muted">Loading…</p>}

      {a && (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(([label, value, sub]) => (
              <Card key={label} className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Revenue" hint="Payments collected, incl. GST"><AreaSeries data={a.series.revenue} fmt={compactInr} /></ChartCard>
            <ChartCard title="Occupancy (%)" hint="Booked hours ÷ open hours across all resources"><LineSeries data={a.series.occupancy} fmt={(v) => `${v}%`} /></ChartCard>
            <ChartCard title="Member growth" hint="Total members at the end of each period"><AreaSeries data={a.series.members} /></ChartCard>
            <ChartCard title="Bookings" hint="Confirmed and completed, by start time"><BarSeries data={a.series.bookings} /></ChartCard>
            <ChartCard title="Churn" hint="Memberships that ended, dated by their renewal date"><BarSeries data={a.series.ended} /></ChartCard>
            <Card>
              <h2 className="mb-3 font-medium">Location performance</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-2">Location</th><th className="text-right">Bookings</th><th className="text-right">Booking revenue</th><th className="text-right">Occupancy</th></tr></thead>
                  <tbody>{a.locations.map((l) => <tr key={l.city} className="border-t"><td className="py-2 font-medium">{l.city}</td><td className="text-right">{l.bookings}</td><td className="text-right">{rupees(l.revenuePaise)}</td><td className="text-right">{l.occupancyPct}%</td></tr>)}</tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">This table always compares every location. Lead conversion and membership conversion are organisation-wide.</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
