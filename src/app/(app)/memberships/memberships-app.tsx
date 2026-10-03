"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { assignMembership, createPlan, listMemberOptions, listMemberships, listPlans, type MemberOpt, type MembershipDTO, type PlanDTO } from "../invoices/actions";
import { createCoupon, listCoupons, listLocationOptions, listPlansAdmin, setCouponActive, setMembershipStatus, setPlanArchived, updatePlan, type CouponDTO, type PlanAdminDTO } from "../invoices/extras";
import { rupees, todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const CYCLE: Record<string, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };
const tone = (s: string) => (({ active: "green", paused: "amber", cancelled: "red", expired: "grey" }) as const)[s as "active"] ?? "grey";

export function MembershipsApp({ canAssign, canCreatePlan }: { canAssign: boolean; canCreatePlan: boolean }) {
  const { loc } = useLocation();
  const [plans, setPlans] = React.useState<PlanDTO[]>([]);
  const [rows, setRows] = React.useState<MembershipDTO[]>([]);
  const [members, setMembers] = React.useState<MemberOpt[]>([]);
  const [places, setPlaces] = React.useState<{ id: string; city: string }[]>([]);
  const [coupons, setCoupons] = React.useState<CouponDTO[]>([]);
  const [adminPlans, setAdminPlans] = React.useState<PlanAdminDTO[] | null>(null);
  const [editPlan, setEditPlan] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; invoiceId?: string } | null>(null);
  const [tick, setTick] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [show, setShow] = React.useState<"plan" | "assign" | "coupon" | null>(null);

  React.useEffect(() => {
    let live = true;
    Promise.all([listPlans(), listMemberships(), listMemberOptions(), listLocationOptions(), listCoupons(), canCreatePlan ? listPlansAdmin() : Promise.resolve(null)]).then(([p, m, o, l, c, ap]) => {
      if (!live) return;
      if (!p.ok) { setError(p.error); return; }
      setError(null); setPlans(p.data);
      if (m.ok) setRows(m.data);
      if (o.ok) setMembers(o.data);
      if (l.ok) setPlaces(l.data);
      if (c.ok) setCoupons(c.data);
      if (ap?.ok) setAdminPlans(ap.data);
    }).catch(() => live && setError("Couldn't load memberships."));
    return () => { live = false; };
  }, [tick, canCreatePlan]);

  const done = (r: { ok: boolean; error?: string }, close = true) => {
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong"); return false; }
    setError(null); if (close) setShow(null); setTick((t) => t + 1); return true;
  };

  const submitPlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    done(await createPlan({
      name: String(f.get("name")), price: Number(f.get("price")), cycle: String(f.get("cycle")) as "monthly",
      benefits: String(f.get("benefits") ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
    }));
  };
  const submitAssign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await assignMembership({ userId: String(f.get("userId")), planId: String(f.get("planId")), startDate: String(f.get("startDate")), locationId: String(f.get("locationId")) || undefined, couponCode: String(f.get("coupon")) || undefined, email: f.get("email") === "on" });
    if (done(r) && r.ok) setNotice({ text: "Membership started and first invoice issued.", invoiceId: r.data.invoiceId });
  };
  const submitCoupon = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    done(await createCoupon({ code: String(f.get("code")), kind: String(f.get("kind")) as "percent", value: Number(f.get("value")), maxUses: f.get("maxUses") ? Number(f.get("maxUses")) : undefined, validUntil: String(f.get("validUntil")) || undefined }));
  };
  const status = async (m: MembershipDTO, s: "active" | "paused" | "cancelled") => {
    if (s === "cancelled" && !window.confirm(`Cancel ${m.who}'s ${m.plan} membership? It stops renewing and can't be restarted.`)) return;
    done(await setMembershipStatus(m.id, s), false);
  };

  const cols: Column<MembershipDTO>[] = [
    { key: "who", header: "Member", render: (m) => <span className="font-medium">{m.who}</span> },
    { key: "plan", header: "Plan", render: (m) => m.plan },
    { key: "start", header: "Started", render: (m) => m.startDate },
    { key: "renew", header: "Next renewal", render: (m) => (m.status === "active" ? m.renewalDate : "—") },
    { key: "st", header: "Status", render: (m) => <Badge tone={tone(m.status)}>{m.status}</Badge> },
    ...(canAssign ? [{ key: "act", header: "", render: (m: MembershipDTO) => (
      <div className="flex gap-1">
        {m.status === "active" && <Button size="sm" variant="ghost" onClick={() => status(m, "paused")}>Pause</Button>}
        {m.status === "paused" && <Button size="sm" variant="ghost" onClick={() => status(m, "active")}>Resume</Button>}
        {(m.status === "active" || m.status === "paused") && <Button size="sm" variant="ghost" onClick={() => status(m, "cancelled")}>Cancel</Button>}
      </div>
    ) }] : []),
  ];
  const search = React.useCallback((m: MembershipDTO) => `${m.who} ${m.plan} ${m.status}`, []);
  const defaultLoc = places.find((p) => p.id === loc)?.id ?? places[0]?.id ?? "";

  return (
    <>
      <PageHeader title="Memberships" sub="Plans, renewals and who is on them."
        actions={<div className="flex flex-wrap gap-2">
          {canCreatePlan && <Button variant="secondary" onClick={() => setShow(show === "plan" ? null : "plan")}>New plan</Button>}
          {canCreatePlan && <Button variant="secondary" onClick={() => setShow(show === "coupon" ? null : "coupon")}>Coupons</Button>}
          {canAssign && <Button onClick={() => setShow(show === "assign" ? null : "assign")}>Assign membership</Button>}
        </div>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{notice.text} {notice.invoiceId && <Link href={`/invoices/${notice.invoiceId}`} className="font-medium underline">View invoice</Link>}</p>}

      {show === "plan" && (
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
      {show === "assign" && (
        <Card className="mb-6">
          <form onSubmit={submitAssign} className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">Member
              <select name="userId" required className={field}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}</select>
            </label>
            <label className="text-sm font-medium">Plan
              <select name="planId" required className={field}><option value="">Select…</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Start date<input name="startDate" type="date" defaultValue={todayIST()} required className={field} /></label>
            <label className="text-sm font-medium">Location
              <select name="locationId" defaultValue={defaultLoc} className={field}>{places.map((p) => <option key={p.id} value={p.id}>{p.city}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Coupon code (optional)<input name="coupon" maxLength={40} className={field} style={{ textTransform: "uppercase" }} /></label>
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="email" defaultChecked /> Email the invoice</label>
            <p className="text-sm text-muted sm:col-span-3">This issues the first invoice (plan price + 18% GST). After that, renewal invoices are issued automatically a few days before each renewal date.</p>
            <Button type="submit" disabled={busy} className="sm:col-span-3">{busy ? "Starting…" : "Start membership & issue invoice"}</Button>
          </form>
        </Card>
      )}
      {show === "coupon" && (
        <Card className="mb-6 space-y-4">
          <form onSubmit={submitCoupon} className="grid gap-4 sm:grid-cols-5">
            <label className="text-sm font-medium">Code<input name="code" required minLength={3} maxLength={40} className={field} style={{ textTransform: "uppercase" }} placeholder="WELCOME10" /></label>
            <label className="text-sm font-medium">Type<select name="kind" className={field}><option value="percent">Percent off</option><option value="fixed">Fixed ₹ off</option></select></label>
            <label className="text-sm font-medium">Value<input name="value" type="number" min="1" step="1" required className={field} /></label>
            <label className="text-sm font-medium">Max uses<input name="maxUses" type="number" min="1" className={field} placeholder="Unlimited" /></label>
            <label className="text-sm font-medium">Valid until<input name="validUntil" type="date" className={field} /></label>
            <Button type="submit" disabled={busy} className="sm:col-span-5 sm:w-fit">{busy ? "Saving…" : "Create coupon"}</Button>
          </form>
          {coupons.length > 0 && (
            <ul className="divide-y border-t text-sm">{coupons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{c.code}</b> <span className="text-muted">· {c.kind === "percent" ? `${c.value}% off` : `${rupees(c.value)} off`} · used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}{c.validUntil ? ` · until ${c.validUntil}` : ""}</span></span>
                <Button size="sm" variant="ghost" onClick={async () => done(await setCouponActive(c.id, !c.active), false)}>{c.active ? "Disable" : "Enable"}</Button>
              </li>
            ))}</ul>
          )}
        </Card>
      )}

      {adminPlans && <p className="mb-3 text-sm text-muted">Changing a price applies to new invoices and renewals from now on. Invoices already issued don&apos;t change.</p>}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(adminPlans ?? plans.map((p) => ({ ...p, archived: false, activeMembers: 0 }))).map((p) => (
          <Card key={p.id} className={p.archived ? "opacity-60" : undefined}>
            {editPlan === p.id && adminPlans ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                if (done(await updatePlan(p.id, { name: String(f.get("name")), price: Number(f.get("price")), cycle: String(f.get("cycle")) as "monthly", benefits: String(f.get("benefits") ?? "").split("\n").map((x) => x.trim()).filter(Boolean) }), false)) setEditPlan(null);
              }} className="space-y-3">
                <input name="name" defaultValue={p.name} required minLength={2} aria-label="Plan name" className={field + " mt-0"} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="price" type="number" min="0" step="1" defaultValue={p.pricePaise / 100} required aria-label="Price in rupees" className={field + " mt-0"} />
                  <select name="cycle" defaultValue={p.billingCycle} aria-label="Billing cycle" className={field + " mt-0"}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select>
                </div>
                <textarea name="benefits" defaultValue={p.benefits.join("\n")} rows={3} aria-label="Benefits, one per line" className={field + " mt-0 h-auto py-2"} />
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>Save</Button><Button type="button" size="sm" variant="secondary" onClick={() => setEditPlan(null)}>Cancel</Button></div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{p.name}</h2>{p.archived && <Badge tone="grey">Archived</Badge>}</div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{rupees(p.pricePaise)}<span className="text-sm font-normal text-muted"> /{CYCLE[p.billingCycle]}</span></p>
                <p className="text-xs text-muted">+ 18% GST{adminPlans ? ` · ${p.activeMembers} active` : ""}</p>
                {p.benefits.length > 0 && <ul className="mt-3 space-y-1 text-sm text-muted">{p.benefits.map((b) => <li key={b}>• {b}</li>)}</ul>}
                {adminPlans && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditPlan(p.id)}>Edit price & details</Button>
                    <Button size="sm" variant="ghost" onClick={async () => done(await setPlanArchived(p.id, !p.archived), false)}>{p.archived ? "Restore" : "Archive"}</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 font-medium">{canAssign ? "All memberships" : "Your membership"}</h2>
      {rows.length === 0 ? <EmptyState title="No memberships yet" hint={canAssign ? "Use “Assign membership” to start one." : "Ask reception to start your plan."} /> : <DataTable rows={rows} columns={cols} searchText={search} />}
    </>
  );
}
