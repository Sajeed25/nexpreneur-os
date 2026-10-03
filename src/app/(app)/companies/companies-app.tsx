"use client";
import * as React from "react";
import { Building2, Plus } from "lucide-react";
import { Avatar, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { rupees } from "@/lib/booking";
import { listMemberOptions, type MemberOpt } from "../invoices/actions";
import { deleteCompany, listCompanies, saveCompany, setCompanyMember, type CompanyDTO } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

function CompanyForm({ c, busy, onSubmit, onCancel }: { c?: CompanyDTO; busy: boolean; onSubmit: (f: FormData) => void; onCancel: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Company name<input name="name" defaultValue={c?.name} required minLength={2} maxLength={160} className={field} /></label>
      <label className="text-sm font-medium">GSTIN<input name="gstin" defaultValue={c?.gstin} maxLength={15} className={field} placeholder="36ABCDE1234F1Z5" /></label>
      <label className="text-sm font-medium">Phone<input name="phone" type="tel" defaultValue={c?.phone} maxLength={20} className={field} /></label>
      <label className="text-sm font-medium sm:col-span-2">Billing email<input name="email" type="email" defaultValue={c?.email} maxLength={190} className={field} /></label>
      <label className="text-sm font-medium sm:col-span-2">Billing address<textarea name="address" defaultValue={c?.address} rows={2} maxLength={500} className={field + " h-auto py-2"} /></label>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save company"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export function CompaniesApp() {
  const [rows, setRows] = React.useState<CompanyDTO[]>([]);
  const [people, setPeople] = React.useState<MemberOpt[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [editing, setEditing] = React.useState<string | "new" | null>(null);

  React.useEffect(() => {
    let live = true;
    Promise.all([listCompanies(), listMemberOptions()]).then(([c, m]) => {
      if (!live) return;
      setLoading(false);
      if (c.ok) { setError(null); setRows(c.data); } else setError(c.error);
      if (m.ok) setPeople(m.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load companies."); } });
    return () => { live = false; };
  }, [tick]);

  const save = async (id: string | null, f: FormData) => {
    const g = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    const r = await saveCompany(id, { name: g("name"), gstin: g("gstin"), address: g("address"), email: g("email"), phone: g("phone") });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setEditing(null); setTick((t) => t + 1); }
  };
  const member = async (companyId: string, userId: string, on: boolean) => {
    const r = await setCompanyMember(companyId, userId, on);
    if (!r.ok) setError(r.error); else { setError(null); setTick((t) => t + 1); }
  };
  const remove = async (c: CompanyDTO) => {
    if (!window.confirm(`Delete ${c.name}? Its members stay, but are unlinked. Past invoices keep their details.`)) return;
    const r = await deleteCompany(c.id);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };

  return (
    <>
      <PageHeader title="Companies" sub="Teams and businesses you bill." actions={<Button onClick={() => setEditing(editing === "new" ? null : "new")}><Plus size={18} />New company</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {editing === "new" && <Card className="mb-6"><CompanyForm busy={busy} onSubmit={(f) => save(null, f)} onCancel={() => setEditing(null)} /></Card>}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No companies yet" hint="Add a company to bill a team on one GST invoice." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((c) => {
            const free = people.filter((p) => !c.members.some((m) => m.id === p.id));
            return (
              <Card key={c.id} className="space-y-4">
                {editing === c.id ? <CompanyForm c={c} busy={busy} onSubmit={(f) => save(c.id, f)} onCancel={() => setEditing(null)} /> : <>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Building2 size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{c.name}</h2>
                      <p className="text-sm text-muted">{c.gstin ? `GSTIN ${c.gstin}` : "No GSTIN"}{c.email ? ` · ${c.email}` : ""}</p>
                      {c.address && <p className="text-sm text-muted">{c.address}</p>}
                    </div>
                    <div className="text-right text-sm"><p className="text-muted">Outstanding</p><p className="font-semibold">{rupees(c.outstandingPaise)}</p></div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Members ({c.members.length})</p>
                    {c.members.length === 0 ? <p className="text-sm text-muted">No members linked yet.</p> : (
                      <ul className="space-y-1">{c.members.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-sm"><Avatar name={m.name} size={28} /><span className="min-w-0 flex-1 truncate">{m.name} <span className="text-muted">· {m.email}</span></span>
                          <Button variant="ghost" size="sm" onClick={() => member(c.id, m.id, false)}>Remove</Button></li>
                      ))}</ul>
                    )}
                    {free.length > 0 && (
                      <select aria-label={`Add a member to ${c.name}`} value="" onChange={(e) => e.target.value && member(c.id, e.target.value, true)} className="mt-3 h-10 w-full rounded-xl border bg-bg px-3 text-sm">
                        <option value="">Add a member…</option>{free.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                      </select>
                    )}
                  </div>
                  <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEditing(c.id)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => remove(c)}>Delete</Button></div>
                </>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
