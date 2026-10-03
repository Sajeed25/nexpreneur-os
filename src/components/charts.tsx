"use client";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";

export type Point = { label: string; value: number };
const axis = { fontSize: 12, fill: "var(--muted)" };
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 } };

export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactElement }) {
  return (
    <Card>
      <h2 className="font-medium">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "h-52" : "mt-4 h-56"}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </Card>
  );
}

const common = (data: Point[], fmt?: (v: number) => string) => (
  <>
    <CartesianGrid vertical={false} stroke="var(--border)" />
    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
    <YAxis tick={axis} axisLine={false} tickLine={false} width={44} tickFormatter={fmt} allowDecimals={false} />
    <Tooltip {...tip} formatter={(v) => (fmt ? fmt(Number(v)) : String(v))} cursor={{ fill: "var(--surface-2)" }} />
  </>
);

export const AreaSeries = ({ data, fmt }: { data: Point[]; fmt?: (v: number) => string }) => (
  <AreaChart data={data}>{common(data, fmt)}<Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} /></AreaChart>
);
export const LineSeries = ({ data, fmt }: { data: Point[]; fmt?: (v: number) => string }) => (
  <LineChart data={data}>{common(data, fmt)}<Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} /></LineChart>
);
export const BarSeries = ({ data, fmt }: { data: Point[]; fmt?: (v: number) => string }) => (
  <BarChart data={data}>{common(data, fmt)}<Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} /></BarChart>
);
export const compactInr = (v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);
