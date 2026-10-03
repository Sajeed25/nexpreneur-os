"use client";
import * as React from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { createInvoice, listInvoices, listMemberOptions, type InvoiceRow, type MemberOpt } from "./actions";
import { listLocationOptions } from "./extras";
import { listCompanyOptions } from "../companies/actions";
import { INV_LABEL, INV_TONE, displayStatus, gst, toPaise } from "@/lib/billing";
import { CITY, rupees, todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
type L = { description: string; qty: number; price: number; taxPct: 0 | 5 | 12 | 18 | 28 };
const blank = (): L => ({ description: "", qty: 1, price: 0, taxPct: 18 });

export function InvoicesApp({ canCreate }: { canCreate: boolean }) {
  const { loc } = useLocation();
  const [rows, setRows] = React.useState<InvoiceRow[]>([]);
  const [members, setMembers] = React.useState<MemberOpt[]>([]);
  const [places, setPlaces] = React.useState<{ id: string; city: string }[]>([]);
  const [companies, setCompanies] = React.useState<{ id: string; name: string; gstin: string }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [userId, setUserId] = React.useState("");
  const [lines, setLines] = React.useState<L[]>([blank()]);
  const [interstate, setInterstate] = React.useState(false);
  const [gstin, setGstin] = React.useState("");
  const [days, setDays] = React.useState(7);
  const [coupon, setCoupon] = React.useState("");
  const [companyId, setCompanyId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [email, setEmail] = React.useState(true);
  const today = todayIST();

  React.useEffect(() => {
    let live = true;
    Promise.all([listInvoices(), canCreate ? listMemberOptions() : Promise.resolve(null), canCreate ? listLocationOptions() : Promise.resolve(null), canCreate ? listCompanyOptions() : Promise.resolve(null)]).then(([i, m, l, c]) => {
      if (!live) return;
      setLoading(false);
      if (!i.ok) setError(i.error); else { setError(null); setRows(i.data); }
      if (m?.ok) setMembers(m.data);
      if (l?.ok) setPlaces(l.data);
      if (c?.ok) setCompanies(c.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load invoices."); } });
    return () => { live = false; };
  }, [tick, canCreate]);

  // Default the invoice's location to the one picked in the top bar.
  React.useEffect(() => {
    const city = CITY[loc];
    setLocationId((cur) => cur || places.find((p) => p.city === city)?.id || places[0]?.id || "");
  }, [loc, places]);

  const totals = gst(lines.map((l) => ({ description: l.description, qty: l.qty, unitPaise: toPaise(l.price), taxPct: l.taxPct })), interstate);
  const setLine = (i: number, patch: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await createInvoice({ userId, lines, interstate, buyerGstin: gstin, dueInDays: days, couponCode: coupon || undefined, locationId: locationId || undefined, companyId: companyId || undefined, email });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setOpen(false); setLines([blank()]); setUserId(""); setGstin(""); setCoupon(""); setCompanyId(""); setTick((t) => t + 1);
  };

  const cols: Column<InvoiceRow>[] = [
    { key: "no", header: "Invoice", render: (r) => <Link href={`/invoices/${r.id}`} className="font-medium text-accent hover:underline">{r.number}</Link> },
    { key: "who", header: "Customer", render: (r) => r.who },
    { key: "date", header: "Date", render: (r) => r.issueDate },
    { key: "due", header: "Due", render: (r) => r.dueDate },
    { key: "tot", header: "Total", render: (r) => rupees(r.totalPaise) },
    { key: "bal", header: "Balance", render: (r) => rupees(r.totalPaise - r.paidPaise) },
    { key: "st", header: "Status", render: (r) => { const s = displayStatus(r, today); return <Badge tone={INV_TONE[s]}>{INV_LABEL[s]}</Badge>; } },
  ];
  const search = React.useCallback((r: InvoiceRow) => `${r.number} ${r.who} ${r.status}`, []);

  return (
    <>
      <PageHeader title="Invoices" sub="GST-ready invoices and what's still owed."
        actions={canCreate && <Button onClick={() => setOpen(!open)}><Plus size={18} />New invoice</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {open && (
        <Card className="mb-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium sm:col-span-2">Customer
                <select value={userId} onChange={(e) => setUserId(e.target.value)} required className={field}>
                  <option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Due in (days)<input type="number" min={0} max={120} value={days} onChange={(e) => setDays(Number(e.target.value))} className={field} /></label>
              <label className="text-sm font-medium">Bill to company (optional)
                <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); const c = companies.find((x) => x.id === e.target.value); if (c?.gstin) setGstin(c.gstin); }} className={field}>
                  <option value="">None</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Customer GSTIN (optional)<input value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={15} className={field} placeholder="36ABCDE1234F1Z5" /></label>
              <label className="text-sm font-medium">Location
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={field}>{places.map((p) => <option key={p.id} value={p.id}>{p.city}</option>)}</select>
              </label>
              <label className="text-sm font-medium">Coupon code (optional)<input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} maxLength={40} className={field} placeholder="WELCOME10" /></label>
              <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} /> Customer is in another state (IGST)</label>
              <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email it to the customer</label>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_80px_130px_90px_auto]">
                  <input aria-label="Description" required placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={field + " mt-0 col-span-2 sm:col-span-1"} />
                  <input aria-label="Quantity" type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className={field + " mt-0"} />
                  <input aria-label="Unit price in rupees" type="number" min={0} step="0.01" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) })} className={field + " mt-0"} />
                  <select aria-label="GST rate" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: Number(e.target.value) as L["taxPct"] })} className={field + " mt-0"}>
                    {[0, 5, 12, 18, 28].map((t) => <option key={t} value={t}>{t}% GST</option>)}
                  </select>
                  <Button type="button" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => setLines([...lines, blank()])}>Add line</Button>
            </div>
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{rupees(totals.subtotal)}</dd></div>
              {interstate ? <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{rupees(totals.igst)}</dd></div> : <>
                <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{rupees(totals.cgst)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{rupees(totals.sgst)}</dd></div></>}
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Total</dt><dd>{rupees(totals.total)}</dd></div>
              {coupon && <p className="text-xs text-muted">The coupon discount is applied when you create the invoice.</p>}
            </dl>
            <Button type="submit" disabled={busy || !userId} className="w-full sm:w-auto">{busy ? "Creating…" : "Create invoice"}</Button>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0
        ? <EmptyState title="No invoices yet" hint={canCreate ? "Create one, or assign a membership to issue the first." : "Invoices for your membership and bookings will show up here."} />
        : <DataTable rows={rows} columns={cols} searchText={search} />}
    </>
  );
}
