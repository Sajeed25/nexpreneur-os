"use client";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useLocation } from "@/components/shell/app-shell";
import { BOOKING_TREND, EVENTS, KPIS, LEADS, LOCATIONS, MEMBER_GROWTH, OCCUPANCY_TREND, RECENT_PAYMENTS, REVENUE_TREND, TODAY, UPCOMING_BOOKINGS } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const RANGES = ["Today", "7 Days", "30 Days", "90 Days", "This Year"] as const;
// Demo only: scale org-wide figures per location until the real queries land.
const FACTOR: Record<string, number> = { all: 1, hyd: 0.7, wgl: 0.18, nlg: 0.12 };
const scale = (v: string, f: number) => {
  if (f === 1 || v.includes("%")) return v;
  const n = Number(v.replace(/[^\d]/g, ""));
  const out = Math.round(n * f);
  return (v.startsWith("₹") ? "₹" : "") + out.toLocaleString("en-IN");
};
const axis = { fontSize: 12, fill: "var(--muted)" };

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <h2 className="mb-4 font-medium">{title}</h2>
      <div className="h-56"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </Card>
  );
}
function List({ title, rows }: { title: string; rows: { a: string; b: string; c?: string }[] }) {
  return (
    <Card>
      <h2 className="mb-3 font-medium">{title}</h2>
      <ul className="divide-y">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0"><span className="block truncate font-medium">{r.a}</span><span className="text-muted">{r.b}</span></span>
            {r.c && <span className="shrink-0 font-medium">{r.c}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Dashboard({ name }: { name: string }) {
  const { loc } = useLocation();
  const [range, setRange] = React.useState<(typeof RANGES)[number]>("30 Days");
  const f = FACTOR[loc] ?? 1;
  const locName = LOCATIONS.find((l) => l.id === loc)?.name ?? "";
  const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 } };

  return (
    <div className="space-y-6">
      <PageHeader title={`Good morning, ${name}`} sub={`Nexpreneur · ${locName}`}
        actions={
          <div role="tablist" aria-label="Date range" className="flex gap-1 overflow-x-auto rounded-xl border bg-surface p-1">
            {RANGES.map((r) => (
              <button key={r} role="tab" aria-selected={r === range} onClick={() => setRange(r)}
                className={cn("h-8 shrink-0 rounded-lg px-3 text-sm", r === range ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{r}</button>
            ))}
          </div>
        } />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{scale(k.value, f)}</p>
            <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", k.up ? "text-emerald-600" : "text-red-600")}>
              {k.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{k.delta}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue trend">
          <AreaChart data={REVENUE_TREND}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="revenue" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>
        <ChartCard title="Occupancy trend (%)">
          <LineChart data={OCCUPANCY_TREND}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={32} domain={[50, 100]} />
            <Tooltip {...tip} />
            <Line type="monotone" dataKey="occupancy" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Member growth">
          <BarChart data={MEMBER_GROWTH}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="members" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Booking trends">
          <BarChart data={BOOKING_TREND}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="d" tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="bookings" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <List title="Today's activity" rows={TODAY.map((t) => ({ a: t.text, b: t.t }))} />
        <List title="Upcoming bookings" rows={UPCOMING_BOOKINGS.map((b) => ({ a: b.who, b: b.what, c: b.when }))} />
        <List title="Recent payments" rows={RECENT_PAYMENTS.map((p) => ({ a: p.who, b: p.ref, c: p.amt }))} />
        <List title="Upcoming events" rows={EVENTS.map((e) => ({ a: e.title, b: e.when }))} />
        <List title="New leads" rows={LEADS.map((l) => ({ a: l.name, b: l.plan, c: l.value }))} />
        <List title="Membership renewals" rows={[
          { a: "Anvaya Design", b: "Private Office", c: "12 Oct" },
          { a: "Kavya Verma", b: "Fixed Desk", c: "15 Oct" },
          { a: "Harsha Nair", b: "Flexi", c: "19 Oct" },
        ]} />
      </div>
    </div>
  );
}
