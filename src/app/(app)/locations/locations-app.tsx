"use client";
import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { archiveLocation, listLocationRows, saveLocation, type LocationRow } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function LocationsApp() {
  const [rows, setRows] = React.useState<LocationRow[]>([]);
  const [canEdit, setCanEdit] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [form, setForm] = React.useState<"new" | string | null>(null);

  React.useEffect(() => {
    let live = true;
    listLocationRows().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data.rows); setCanEdit(r.data.canEdit); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load locations."); } });
    return () => { live = false; };
  }, [tick]);

  const save = async (e: React.FormEvent<HTMLFormElement>, id: string | null) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await saveLocation(id, { name: String(f.get("name")), city: String(f.get("city") ?? "") });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setForm(null); setTick((t) => t + 1); }
  };
  const archive = async (l: LocationRow) => {
    if (!window.confirm(`Archive ${l.name}?`)) return;
    const r = await archiveLocation(l.id);
    if (!r.ok) setError(r.error); else { setError(null); setTick((t) => t + 1); }
  };

  const Form = ({ l }: { l?: LocationRow }) => (
    <form onSubmit={(e) => save(e, l?.id ?? null)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Name<input name="name" defaultValue={l?.name} required minLength={2} maxLength={120} className={field} placeholder="Nexpreneur Karimnagar" /></label>
      <label className="text-sm font-medium">City<input name="city" defaultValue={l?.city} maxLength={120} className={field} placeholder="Karimnagar" /></label>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>
  );

  return (
    <>
      <PageHeader title="Locations" sub="Every Nexpreneur space. New locations appear in the location selector straight away."
        actions={canEdit && <Button onClick={() => setForm(form === "new" ? null : "new")}><Plus size={18} />Add location</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {form === "new" && <Card className="mb-6"><Form /></Card>}
      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No locations yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <Card key={l.id}>
              {form === l.id ? <Form l={l} /> : (
                <>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><MapPin size={18} /></span>
                    <div className="min-w-0"><h2 className="font-semibold">{l.name}</h2><p className="text-sm text-muted">{l.city || "No city set"}</p></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted">Resources</dt><dd className="text-xl font-semibold">{l.resources}</dd></div>
                    <div><dt className="text-muted">Active members</dt><dd className="text-xl font-semibold">{l.activeMembers}</dd></div>
                  </dl>
                  {canEdit && <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setForm(l.id)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => archive(l)}>Archive</Button></div>}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
