"use client";
import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { AreaSeries, BarSeries, ChartCard, LineSeries, compactInr } from "@/components/charts";
import { useLocation } from "@/components/shell/app-shell";
import { BOOKING_TREND, EVENTS, KPIS, LEADS, LOCATIONS, MEMBER_GROWTH, OCCUPANCY_TREND, RECENT_PAYMENTS, REVENUE_TREND, TODAY, UPCOMING_BOOKINGS } from "@/lib/demo-data";
import { fmtIST, rupees } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { getDashboard, type DashboardDTO } from "./actions";

const RANGES = [["today", "Today"], ["7d", "7 Days"], ["30d", "30 Days"], ["90d", "90 Days"], ["year", "This Year"]] as const;

function List({ title, rows, empty }: { title: string; rows: { a: string; b: string; c?: string }[]; empty?: string }) {
  return (
    <Card>
      <h2 className="mb-3 font-medium">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">{empty ?? "Nothing yet."}</p> : (
        <ul className="divide-y">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{r.a}</span><span className="text-muted">{r.b}</span></span>
              {r.c && <span className="shrink-0 font-medium">{r.c}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
const when = (iso: string) => `${fmtIST(iso, { day: "numeric", month: "short" })}, ${fmtIST(iso, { hour: "numeric", minute: "2-digit" })}`;

function RangeTabs({ range, setRange }: { range: string; setRange: (r: string) => void }) {
  return (
    <div role="tablist" aria-label="Date range" className="flex gap-1 overflow-x-auto rounded-xl border bg-surface p-1">
      {RANGES.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={id === range} onClick={() => setRange(id)}
          className={cn("h-8 shrink-0 rounded-lg px-3 text-sm", id === range ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{label}</button>
      ))}
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Dashboard({ name }: { name: string }) {
  const { loc, locations } = useLocation();
  const [range, setRange] = React.useState("30d");
  const [real, setReal] = React.useState<DashboardDTO | null>(null);
  const [demo, setDemo] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    getDashboard(range, loc).then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setReal(r.data); setDemo(false); setError(null); }
      else if (r.error === "demo") setDemo(true);
      else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load the dashboard."); } });
    return () => { live = false; };
  }, [range, loc]);

  if (demo) return <DemoDashboard name={name} />;
  const a = real?.analytics;
  const k = a?.kpis;
  const cards: [string, string, string?][] = k && real ? [
    ...(real.finance ? [["Revenue collected", rupees(k.collectedPaise), "incl. GST"] as [string, string, string], ["MRR", rupees(k.mrrPaise), "monthly recurring"] as [string, string, string]] : []),
    ["Active members", String(k.activeMembers)], ["Occupancy", `${k.occupancyPct}%`], ["Bookings", String(k.bookings)],
    ...(real.finance ? [["Outstanding", rupees(k.outstandingPaise)] as [string, string]] : []),
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting()}, ${name}`} sub={`Nexpreneur · ${locations.find((l) => l.id === loc)?.name ?? "All Locations"}`} actions={<RangeTabs range={range} setRange={setRange} />} />
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && !real && <p className="text-sm text-muted">Loading…</p>}
      {real && a && (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map(([label, value, sub]) => (
              <Card key={label} className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {real.finance && <ChartCard title="Revenue trend"><AreaSeries data={a.series.revenue} fmt={compactInr} /></ChartCard>}
            <ChartCard title="Occupancy trend (%)"><LineSeries data={a.series.occupancy} fmt={(v) => `${v}%`} /></ChartCard>
            <ChartCard title="Member growth"><AreaSeries data={a.series.members} /></ChartCard>
            <ChartCard title="Booking trends"><BarSeries data={a.series.bookings} /></ChartCard>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <List title="Today's activity" empty="No activity yet." rows={real.activity.map((x) => ({ a: x.text, b: when(x.at) }))} />
            <List title="Upcoming bookings" empty="No upcoming bookings." rows={real.upcomingBookings.map((b) => ({ a: b.who, b: b.what, c: when(b.startsAt) }))} />
            {real.recentPayments && <List title="Recent payments" empty="No payments yet." rows={real.recentPayments.map((p) => ({ a: p.who, b: p.ref, c: rupees(p.amountPaise) }))} />}
            <List title="Upcoming events" empty="No upcoming events." rows={real.events.map((e) => ({ a: e.title, b: when(e.startsAt) }))} />
            {real.leads && <List title="New leads" empty="No leads yet." rows={real.leads.map((l) => ({ a: l.name, b: l.plan || "—", c: l.valuePaise ? rupees(l.valuePaise) : undefined }))} />}
            {real.renewals && <List title="Membership renewals" empty="No renewals coming up." rows={real.renewals.map((r) => ({ a: r.who, b: r.plan, c: r.date }))} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Demo mode (no database connected): sample numbers so the layout can be previewed ----
const FACTOR: Record<string, number> = { all: 1, hyd: 0.7, wgl: 0.18, nlg: 0.12 };
const scale = (v: string, f: number) => {
  if (f === 1 || v.includes("%")) return v;
  const n = Math.round(Number(v.replace(/[^\d]/g, "")) * f);
  return (v.startsWith("₹") ? "₹" : "") + n.toLocaleString("en-IN");
};

function DemoDashboard({ name }: { name: string }) {
  const { loc } = useLocation();
  const [range, setRange] = React.useState("30d");
  const f = FACTOR[loc] ?? 1;
  const locName = LOCATIONS.find((l) => l.id === loc)?.name ?? "";
  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting()}, ${name}`} sub={`Nexpreneur · ${locName} · sample data`} actions={<RangeTabs range={range} setRange={setRange} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-4"><p className="text-sm text-muted">{k.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{scale(k.value, f)}</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600"><ArrowUpRight size={14} />{k.delta}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue trend"><AreaSeries data={REVENUE_TREND.map((r) => ({ label: r.m, value: r.revenue }))} fmt={compactInr} /></ChartCard>
        <ChartCard title="Occupancy trend (%)"><LineSeries data={OCCUPANCY_TREND.map((r) => ({ label: r.m, value: r.occupancy }))} fmt={(v) => `${v}%`} /></ChartCard>
        <ChartCard title="Member growth"><AreaSeries data={MEMBER_GROWTH.map((r) => ({ label: r.m, value: r.members }))} /></ChartCard>
        <ChartCard title="Booking trends"><BarSeries data={BOOKING_TREND.map((r) => ({ label: r.d, value: r.bookings }))} /></ChartCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <List title="Today's activity" rows={TODAY.map((t) => ({ a: t.text, b: t.t }))} />
        <List title="Upcoming bookings" rows={UPCOMING_BOOKINGS.map((b) => ({ a: b.who, b: b.what, c: b.when }))} />
        <List title="Recent payments" rows={RECENT_PAYMENTS.map((p) => ({ a: p.who, b: p.ref, c: p.amt }))} />
        <List title="Upcoming events" rows={EVENTS.map((e) => ({ a: e.title, b: e.when }))} />
        <List title="New leads" rows={LEADS.map((l) => ({ a: l.name, b: l.plan, c: l.value }))} />
      </div>
    </div>
  );
}
