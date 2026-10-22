"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { fmtIST } from "@/lib/booking";
import { listTours, setTourStatus, type TourDTO, type ToursData } from "./tours";

const TONE = { scheduled: "blue", completed: "green", no_show: "red", cancelled: "grey" } as const;
const LABEL = { scheduled: "Booked", completed: "Done", no_show: "No-show", cancelled: "Cancelled" } as const;
const when = (iso: string) => `${fmtIST(iso, { weekday: "short", day: "numeric", month: "short" })}, ${fmtIST(iso, { hour: "numeric", minute: "2-digit" })}`;

/** Tours booked through the public page, with the link to share. */
export function ToursPanel({ onChange }: { onChange?: () => void }) {
  const [d, setD] = React.useState<ToursData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { listTours().then((r) => (r.ok ? (setError(null), setD(r.data)) : setError(r.error))); }, [tick]);

  if (error) return <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return null;
  const act = async (t: TourDTO, status: "completed" | "no_show" | "cancelled" | "scheduled") => {
    const r = await setTourStatus({ id: t.id, status });
    if (!r.ok) setError(r.error); else { setError(null); setTick((n) => n + 1); onChange?.(); }
  };
  const copy = async () => {
    if (!d.link) return;
    const url = d.link.startsWith("/") ? window.location.origin + d.link : d.link;
    try { await navigator.clipboard.writeText(url); setInfo("Link copied."); } catch { setInfo(url); }
  };
  const row = (t: TourDTO, upcoming: boolean) => (
    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div><p className="font-medium">{t.name}{t.company ? <span className="font-normal text-muted"> · {t.company}</span> : null}</p>
        <p className="text-xs text-muted">{when(t.startsAt)} · {t.location}{t.phone ? ` · ${t.phone}` : ""}{t.email ? ` · ${t.email}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TONE[t.status as "scheduled"] ?? "grey"}>{LABEL[t.status as "scheduled"] ?? t.status}</Badge>
        {!upcoming && t.status === "scheduled" && <><Button size="sm" variant="secondary" onClick={() => act(t, "completed")}>Done</Button><Button size="sm" variant="ghost" onClick={() => act(t, "no_show")}>No-show</Button></>}
        {upcoming && <Button size="sm" variant="ghost" onClick={() => act(t, "cancelled")}>Cancel</Button>}
      </div>
    </li>
  );
  // A booked tour whose time has passed still needs an outcome.
  const needsOutcome = d.recent.filter((t) => t.status === "scheduled");
  return (
    <Card className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-medium">Tours</h2><p className="text-sm text-muted">Visitors book these on your public page. A booked tour moves its lead to “Tour Scheduled”.</p></div>
        {d.link && <div className="flex items-center gap-2"><code className="max-w-[240px] truncate rounded-lg bg-surface-2 px-2 py-1 text-xs">{d.link}</code><Button size="sm" variant="secondary" onClick={copy}><Copy size={14} />Copy link</Button></div>}
      </div>
      {info && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{info}</p>}
      {needsOutcome.length > 0 && <div><p className="text-sm font-medium">How did these go?</p><ul className="divide-y text-sm">{needsOutcome.map((t) => row(t, false))}</ul></div>}
      {d.upcoming.length === 0 ? <p className="text-sm text-muted">No upcoming tours.</p> : <ul className="divide-y text-sm">{d.upcoming.map((t) => row(t, true))}</ul>}
      {d.recent.filter((t) => t.status !== "scheduled").length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer text-muted">Past tours</summary><ul className="divide-y">{d.recent.filter((t) => t.status !== "scheduled").map((t) => row(t, false))}</ul></details>
      )}
    </Card>
  );
}
