"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
import { addActivity, createLead, listActivities, listLeads, moveLead, type ActivityDTO, type LeadDTO } from "./actions";
import { LEAD_STAGES, STAGE_LABEL } from "./stages";
import { rupees } from "@/lib/booking";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function CrmApp() {
  const [leads, setLeads] = React.useState<LeadDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState<LeadDTO | null>(null);
  const [tick, setTick] = React.useState(0);
  const [over, setOver] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    listLeads().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setLeads(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load leads."); } });
    return () => { live = false; };
  }, [tick]);

  const move = async (id: string, stage: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l))); // optimistic
    const r = await moveLead({ id, stage: stage as "new" });
    if (!r.ok) { setLeads(prev); setError(r.error); } else setError(null);
  };
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const g = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    const r = await createLead({ name: g("name"), company: g("company"), phone: g("phone"), email: g("email"), requirements: g("requirements"), plan: g("plan"), value: Number(g("value") || 0) });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setShowForm(false); setTick((t) => t + 1); }
  };

  const total = leads.filter((l) => l.stage !== "lost").reduce((s, l) => s + l.valuePaise, 0);

  return (
    <>
      <PageHeader title="CRM" sub={`${leads.length} leads · pipeline value ${rupees(total)}`}
        actions={<Button onClick={() => setShowForm(!showForm)}><Plus size={18} />New lead</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<input name="name" required minLength={2} className={field} /></label>
            <label className="text-sm font-medium">Company<input name="company" className={field} /></label>
            <label className="text-sm font-medium">Phone<input name="phone" type="tel" className={field} /></label>
            <label className="text-sm font-medium">Email<input name="email" type="email" className={field} /></label>
            <label className="text-sm font-medium">Interested plan<input name="plan" className={field} placeholder="Private Office" /></label>
            <label className="text-sm font-medium">Expected value (₹)<input name="value" type="number" min="0" className={field} /></label>
            <label className="text-sm font-medium sm:col-span-2">Requirements<textarea name="requirements" rows={2} className={field + " h-auto py-2"} /></label>
            <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Saving…" : "Add lead"}</Button>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {LEAD_STAGES.map((st) => {
            const col = leads.filter((l) => l.stage === st);
            return (
              <section key={st} aria-label={STAGE_LABEL[st]}
                onDragOver={(e) => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, st); }}
                className={cn("w-72 shrink-0 rounded-2xl border bg-surface-2 p-3", over === st && "ring-2 ring-accent")}>
                <h2 className="mb-3 flex items-center justify-between text-sm font-medium">{STAGE_LABEL[st]}<span className="text-muted">{col.length}</span></h2>
                <div className="space-y-2">
                  {col.map((l) => (
                    <div key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      className="cursor-grab rounded-xl border bg-surface p-3 shadow-soft active:cursor-grabbing">
                      <button onClick={() => setOpen(l)} className="block w-full text-left">
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted">{l.company || "—"}{l.plan ? ` · ${l.plan}` : ""}</p>
                        {l.valuePaise > 0 && <p className="mt-1 text-sm">{rupees(l.valuePaise)}</p>}
                      </button>
                      <select aria-label={`Move ${l.name}`} value={l.stage} onChange={(e) => move(l.id, e.target.value)} className="mt-2 h-8 w-full rounded-lg border bg-bg px-2 text-xs">
                        {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {open && <LeadDrawer lead={leads.find((l) => l.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LeadDrawer({ lead, onClose }: { lead: LeadDTO; onClose: () => void }) {
  const [acts, setActs] = React.useState<ActivityDTO[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { listActivities(lead.id).then((r) => r.ok && setActs(r.data)); }, [lead.id, lead.stage, tick]);
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await addActivity({ leadId: lead.id, kind: String(f.get("kind")) as "note", note: String(f.get("note")) });
    if (!r.ok) setErr(r.error); else { setErr(null); form.reset(); setTick((t) => t + 1); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <aside role="dialog" aria-label={lead.name} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-surface p-6 shadow-2xl">
        <button onClick={onClose} aria-label="Close" className="float-right grid size-9 place-items-center rounded-xl hover:bg-surface-2"><X size={18} /></button>
        <h2 className="text-xl font-semibold">{lead.name}</h2>
        <p className="text-muted">{lead.company || "No company"} · {STAGE_LABEL[lead.stage]}</p>
        <dl className="mt-4 space-y-2 text-sm">
          {lead.phone && <div className="flex justify-between"><dt className="text-muted">Phone</dt><dd>{lead.phone}</dd></div>}
          {lead.email && <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{lead.email}</dd></div>}
          {lead.plan && <div className="flex justify-between"><dt className="text-muted">Interested in</dt><dd>{lead.plan}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Expected value</dt><dd>{rupees(lead.valuePaise)}</dd></div>
          {lead.requirements && <div><dt className="text-muted">Requirements</dt><dd className="mt-1">{lead.requirements}</dd></div>}
        </dl>
        <form onSubmit={add} className="mt-6 space-y-2">
          <div className="flex gap-2">
            <select name="kind" className="h-11 rounded-xl border bg-surface px-3 text-sm"><option value="note">Note</option><option value="call">Call log</option></select>
            <input name="note" required maxLength={1000} placeholder="Add a note or follow-up…" className="h-11 min-w-0 flex-1 rounded-xl border bg-surface px-3 text-sm outline-none focus:border-accent" />
          </div>
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
          <Button type="submit" size="sm">Add to timeline</Button>
        </form>
        <h3 className="mb-2 mt-6 text-sm font-medium">Activity</h3>
        {acts.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
          <ol className="space-y-3 border-l pl-4">{acts.map((a) => (
            <li key={a.id} className="text-sm"><p>{a.note}</p><p className="text-xs text-muted">{a.kind} · {new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></li>
          ))}</ol>
        )}
      </aside>
    </div>
  );
}
