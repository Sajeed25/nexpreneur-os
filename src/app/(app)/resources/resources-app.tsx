"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, statusTone } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { KINDS, kindLabel, rupees } from "@/lib/booking";
import { archiveResource, listResourceRows, saveResource, setResourceStatus, type ResourceRow } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const STATUS = ["available", "reserved", "maintenance", "unavailable"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function PriceCell({ r }: { r: ResourceRow }) {
  return <>{r.hourlyPaise != null && <span>{rupees(r.hourlyPaise)}/hr </span>}{r.dailyPaise != null && <span>{rupees(r.dailyPaise)}/day</span>}{r.hourlyPaise == null && r.dailyPaise == null && "—"}</>;
}

export function ResourcesApp() {
  const { loc } = useLocation();
  const [rows, setRows] = React.useState<ResourceRow[]>([]);
  const [places, setPlaces] = React.useState<{ id: string; name: string }[]>([]);
  const [canEdit, setCanEdit] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [form, setForm] = React.useState<"new" | ResourceRow | null>(null);
  const [kind, setKind] = React.useState("");
  const [formKind, setFormKind] = React.useState("meeting_room");

  React.useEffect(() => {
    let live = true;
    listResourceRows().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data.rows); setPlaces(r.data.locations); setCanEdit(r.data.canEdit); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load resources."); } });
    return () => { live = false; };
  }, [tick]);

  const shown = React.useMemo(() => rows.filter((r) => (loc === "all" || r.locationId === loc) && (!kind || r.kind === kind)), [rows, loc, kind]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    setBusy(true); setInfo(null);
    const editing = form && form !== "new" ? form : null;
    const r = await saveResource(editing?.id ?? null, {
      locationId: String(f.get("locationId")), name: String(f.get("name")), kind: String(f.get("kind")), capacity: Number(f.get("capacity")),
      hourly: num("hourly"), daily: num("daily"), status: String(f.get("status")) as "available", count: editing ? undefined : num("count"),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setForm(null); setInfo(editing ? "Saved." : `Added ${r.data.created} resource${r.data.created > 1 ? "s" : ""}.`); setTick((t) => t + 1);
  };
  const status = async (r: ResourceRow, s: string) => {
    const res = await setResourceStatus(r.id, s);
    if (!res.ok) setError(res.error); else { setError(null); setTick((t) => t + 1); }
  };
  const archive = async (r: ResourceRow) => {
    if (!window.confirm(`Archive ${r.name}? It disappears from booking and the floor map.`)) return;
    const res = await archiveResource(r.id);
    if (!res.ok) setError(res.error); else { setError(null); setTick((t) => t + 1); }
  };

  const cols: Column<ResourceRow>[] = [
    { key: "name", header: "Resource", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "kind", header: "Type", render: (r) => kindLabel(r.kind) },
    { key: "loc", header: "Location", render: (r) => r.locationName },
    { key: "cap", header: "Capacity", render: (r) => r.capacity },
    { key: "price", header: "Price (before GST)", render: (r) => <PriceCell r={r} /> },
    { key: "st", header: "Status", render: (r) => canEdit
      ? <select value={r.status} onChange={(e) => status(r, e.target.value)} aria-label={`Status of ${r.name}`} className="h-9 rounded-lg border bg-bg px-2 text-sm">{STATUS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select>
      : <Badge tone={statusTone(cap(r.status))}>{cap(r.status)}</Badge> },
    ...(canEdit ? [{ key: "act", header: "", render: (r: ResourceRow) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setFormKind(r.kind); setForm(r); }}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => archive(r)}>Archive</Button>
      </div>
    ) }] : []),
  ];
  const search = React.useCallback((r: ResourceRow) => `${r.name} ${kindLabel(r.kind)} ${r.locationName} ${r.status}`, []);
  const editing = form && form !== "new" ? form : null;
  const dailyKind = ["hot_desk", "dedicated_desk", "private_office"].includes(formKind);
  const hourlyKind = ["meeting_room", "phone_booth", "event_space"].includes(formKind);

  return (
    <>
      <PageHeader title="Resources" sub="Desks, rooms, offices and spaces, with their prices."
        actions={canEdit && <Button onClick={() => { setFormKind("meeting_room"); setForm(form === "new" ? null : "new"); }}><Plus size={18} />Add resource</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      {form && (
        <Card className="mb-6">
          <form key={editing?.id ?? "new"} onSubmit={save} className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium sm:col-span-2">Name{!editing && <span className="font-normal text-muted"> (when adding several, numbers are added: Hot Desk 01, 02…)</span>}
              <input name="name" defaultValue={editing?.name} required maxLength={160} className={field} placeholder="Meeting Room A" /></label>
            <label className="text-sm font-medium">Location
              <select name="locationId" required defaultValue={editing?.locationId ?? (places.some((p) => p.id === loc) ? loc : places[0]?.id)} className={field}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-sm font-medium">Type
              <select name="kind" value={formKind} onChange={(e) => setFormKind(e.target.value)} className={field}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
            <label className="text-sm font-medium">Capacity (people)<input name="capacity" type="number" min={1} defaultValue={editing?.capacity ?? 1} required className={field} /></label>
            <label className="text-sm font-medium">Status
              <select name="status" defaultValue={editing?.status ?? "available"} className={field}>{STATUS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></label>
            {(hourlyKind || !dailyKind) && <label className="text-sm font-medium">Price per hour (₹)<input name="hourly" type="number" min={0} step="1" required={hourlyKind} defaultValue={editing?.hourlyPaise != null ? editing.hourlyPaise / 100 : undefined} className={field} /></label>}
            {(dailyKind || !hourlyKind) && <label className="text-sm font-medium">Price per day (₹)<input name="daily" type="number" min={0} step="1" required={dailyKind} defaultValue={editing?.dailyPaise != null ? editing.dailyPaise / 100 : undefined} className={field} /></label>}
            {!editing && <label className="text-sm font-medium">How many to add<input name="count" type="number" min={1} max={50} defaultValue={1} className={field} /></label>}
            <p className="text-xs text-muted sm:col-span-3">Prices are before 18% GST. A price change applies to new bookings; existing bookings keep their price.</p>
            <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add"}</Button><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button></div>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="No resources yet" hint={canEdit ? "Use “Add resource” to create your first desks and rooms." : "Nothing has been set up yet."} />
      ) : (
        <DataTable rows={shown} columns={cols} searchText={search} pageSize={15}
          filters={<select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type" className="h-10 rounded-xl border bg-bg px-3 text-sm"><option value="">All types</option>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>} />
      )}
    </>
  );
}
