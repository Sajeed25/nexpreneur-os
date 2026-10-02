"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { assignMembership, createPlan, listMemberOptions, listMemberships, listPlans, type MemberOpt, type MembershipDTO, type PlanDTO } from "../invoices/actions";
import { rupees, todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const CYCLE: Record<string, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };
const tone = (s: string) => (({ active: "green", paused: "amber", cancelled: "red", expired: "grey" }) as const)[s as "active"] ?? "grey";

export function MembershipsApp({ canAssign, canCreatePlan }: { canAssign: boolean; canCreatePlan: boolean }) {
  const [plans, setPlans] = React.useState<PlanDTO[]>([]);
  const [rows, setRows] = React.useState<MembershipDTO[]>([]);
  const [members, setMembers] = React.useState<MemberOpt[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; invoiceId?: string } | null>(null);
  const [tick, setTick] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [showPlan, setShowPlan] = React.useState(false);
  const [showAssign, setShowAssign] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    Promise.all([listPlans(), listMemberships(), listMemberOptions()]).then(([p, m, o]) => {
      if (!live) return;
      if (!p.ok) { setError(p.error); return; }
      setError(null); setPlans(p.data);
      if (m.ok) setRows(m.data);
      if (o.ok) setMembers(o.data);
    }).catch(() => live && setError("Couldn't load memberships."));
    return () => { live = false; };
  }, [tick]);

  const submitPlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await createPlan({
      name: String(f.get("name")), price: Number(f.get("price")), cycle: String(f.get("cycle")) as "monthly",
      benefits: String(f.get("benefits") ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setShowPlan(false); setTick((t) => t + 1); }
  };
  const submitAssign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await assignMembership({ userId: String(f.get("userId")), planId: String(f.get("planId")), startDate: String(f.get("startDate")) });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else { setError(null); setShowAssign(false); setNotice({ text: "Membership started and first invoice issued.", invoiceId: r.data.invoiceId }); setTick((t) => t + 1); }
  };

  const cols: Column<MembershipDTO>[] = [
    { key: "who", header: "Member", render: (m) => <span className="font-medium">{m.who}</span> },
    { key: "plan", header: "Plan", render: (m) => m.plan },
    { key: "start", header: "Started", render: (m) => m.startDate },
    { key: "renew", header: "Renews", render: (m) => m.renewalDate },
    { key: "st", header: "Status", render: (m) => <Badge tone={tone(m.status)}>{m.status}</Badge> },
  ];
  const search = React.useCallback((m: MembershipDTO) => `${m.who} ${m.plan} ${m.status}`, []);

  return (
    <>
      <PageHeader title="Memberships" sub="Plans and who is on them."
        actions={<div className="flex gap-2">
          {canCreatePlan && <Button variant="secondary" onClick={() => setShowPlan(!showPlan)}>New plan</Button>}
          {canAssign && <Button onClick={() => setShowAssign(!showAssign)}>Assign membership</Button>}
        </div>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{notice.text} {notice.invoiceId && <Link href={`/invoices/${notice.invoiceId}`} className="font-medium underline">View invoice</Link>}</p>}

      {showPlan && (
        <Card className="mb-6">
          <form onSubmit={submitPlan} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Plan name<input name="name" required minLength={2} className={field} placeholder="Startup Desk" /></label>
            <label className="text-sm font-medium">Price (₹, before GST)<input name="price" type="number" min="0" step="1" required className={field} /></label>
            <label className="text-sm font-medium">Billing cycle
              <select name="cycle" className={field}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">Benefits (one per line)<textarea name="benefits" rows={3} className={field + " h-auto py-2"} /></label>
            <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Saving…" : "Create plan"}</Button>
          </form>
        </Card>
      )}
      {showAssign && (
        <Card className="mb-6">
          <form onSubmit={submitAssign} className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">Member
              <select name="userId" required className={field}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}</select>
            </label>
            <label className="text-sm font-medium">Plan
              <select name="planId" required className={field}><option value="">Select…</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Start date<input name="startDate" type="date" defaultValue={todayIST()} required className={field} /></label>
            <p className="text-sm text-muted sm:col-span-3">This also issues the first invoice (plan price + 18% GST), due in 7 days.</p>
            <Button type="submit" disabled={busy} className="sm:col-span-3">{busy ? "Starting…" : "Start membership & issue invoice"}</Button>
          </form>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.id}>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{rupees(p.pricePaise)}<span className="text-sm font-normal text-muted"> /{CYCLE[p.billingCycle]}</span></p>
            <p className="text-xs text-muted">+ 18% GST</p>
            {p.benefits.length > 0 && <ul className="mt-3 space-y-1 text-sm text-muted">{p.benefits.map((b) => <li key={b}>• {b}</li>)}</ul>}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 font-medium">{canAssign ? "All memberships" : "Your membership"}</h2>
      {rows.length === 0 ? <EmptyState title="No memberships yet" hint={canAssign ? "Use “Assign membership” to start one." : "Ask reception to start your plan."} /> : <DataTable rows={rows} columns={cols} searchText={search} />}
    </>
  );
}
