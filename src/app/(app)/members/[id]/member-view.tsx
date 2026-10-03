"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { fmtIST, rupees } from "@/lib/booking";
import { INV_LABEL, INV_TONE } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { assignMembership } from "../../invoices/actions";
import { setMembershipStatus } from "../../invoices/extras";
import { getMember, memberOptions, sendInvitation, setMemberActive, setTemporaryPassword, updateMember, type MemberDetail, type MemberOptions } from "../actions";
import { MemberForm, field } from "../member-form";

const TABS = ["Overview", "Membership", "Bookings", "Invoices", "Activity", "Access", "Documents"] as const;
type Tab = (typeof TABS)[number];

export function MemberView({ id }: { id: string }) {
  const [d, setD] = React.useState<MemberDetail | null>(null);
  const [opts, setOpts] = React.useState<MemberOptions | null>(null);
  const [tab, setTab] = React.useState<Tab>("Overview");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    Promise.all([getMember(id), memberOptions()]).then(([m, o]) => {
      if (!live) return;
      if (m.ok) { setError(null); setD(m.data); } else setError(m.error);
      if (o.ok) setOpts(o.data);
    }).catch(() => live && setError("Couldn't load this member."));
    return () => { live = false; };
  }, [id, tick]);

  if (error && !d) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d || !opts) return <p className="text-sm text-muted">Loading…</p>;
  const m = d.member;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, close = false) => {
    setBusy(true); setInfo(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong"); return false; }
    setError(null); setInfo(ok); if (close) setEditing(false); setTick((t) => t + 1); return true;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/members" className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Members</Link>
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={m.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{m.name}</h1>
          <p className="truncate text-muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
          <p className="text-sm text-muted">{[m.jobTitle, m.company].filter(Boolean).join(" · ") || "No job title or company"}{m.locationName ? ` · ${m.locationName}` : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-1"><Badge tone={m.active ? "green" : "grey"}>{m.active ? "Active" : "Deactivated"}</Badge>{m.plan && <Badge tone="blue">{m.plan}</Badge>}</div>
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border bg-surface p-1">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 shrink-0 rounded-lg px-3 text-sm", tab === t ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{t}</button>)}
      </div>

      {tab === "Overview" && (
        <Card className="space-y-5">
          {editing ? (
            <MemberForm opts={opts} initial={m} mode="edit" busy={busy} onCancel={() => setEditing(false)}
              onSubmit={(v) => run(() => updateMember(id, { name: v.name, email: v.email, phone: v.phone, jobTitle: v.jobTitle, company: v.company, companyId: v.companyId, locationId: v.locationId }), "Saved.", true)} />
          ) : (
            <>
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Joined</dt><dd className="font-medium">{new Date(m.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
                <div><dt className="text-muted">Last sign-in</dt><dd className="font-medium">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never"}</dd></div>
                {opts.canAssign && <div><dt className="text-muted">Owes</dt><dd className="font-medium">{rupees(m.owedPaise)}</dd></div>}
              </dl>
              {opts.canEdit && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit details</Button>
                  <Button variant="secondary" size="sm" disabled={busy || !opts.emailReady} title={opts.emailReady ? "" : "Email isn't set up yet"} onClick={() => run(() => sendInvitation(id), `Invitation sent to ${m.email}.`)}>Send password link</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setMemberActive(id, !m.active), m.active ? "Member deactivated." : "Member reactivated.")}>{m.active ? "Deactivate" : "Reactivate"}</Button>
                </div>
              )}
              {opts.canEdit && (
                <form onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const pw = String(new FormData(f).get("pw")); if (await run(() => setTemporaryPassword(id, pw), "Password changed. They've been signed out everywhere.")) f.reset(); }} className="flex flex-wrap items-end gap-2 border-t pt-4">
                  <label className="text-sm font-medium">Set a temporary password<input name="pw" type="text" required minLength={8} maxLength={72} autoComplete="off" className={field + " w-64"} placeholder="At least 8 characters" /></label>
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>Set password</Button>
                </form>
              )}
            </>
          )}
        </Card>
      )}

      {tab === "Membership" && (
        <div className="space-y-4">
          {opts.canAssign && (
            <Card>
              <h2 className="mb-3 font-medium">Start a plan</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run(() => assignMembership({ userId: id, planId: String(f.get("planId")), startDate: String(f.get("startDate")), locationId: m.locationId ?? undefined, couponCode: String(f.get("coupon")) || undefined, email: true }), "Plan started and invoice issued.");
              }} className="grid gap-3 sm:grid-cols-4">
                <label className="text-sm font-medium sm:col-span-2">Plan<select name="planId" required className={field}><option value="">Select…</option>{opts.plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}</select></label>
                <label className="text-sm font-medium">Start date<input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} /></label>
                <label className="text-sm font-medium">Coupon<input name="coupon" maxLength={40} className={field} style={{ textTransform: "uppercase" }} /></label>
                <Button type="submit" disabled={busy} className="sm:col-span-4 sm:w-fit">Start plan & issue invoice</Button>
              </form>
            </Card>
          )}
          <Card className="py-1">
            {d.memberships.length === 0 ? <p className="py-6 text-center text-sm text-muted">No membership yet.</p> : (
              <ul className="divide-y text-sm">{d.memberships.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span><b>{x.plan}</b> <span className="text-muted">· since {x.start}{x.status === "active" ? ` · renews ${x.renewal}` : ""}</span></span>
                  <span className="flex items-center gap-2"><Badge tone={x.status === "active" ? "green" : x.status === "paused" ? "amber" : "grey"}>{x.status}</Badge>
                    {opts.canAssign && x.status === "active" && <Button size="sm" variant="ghost" onClick={() => run(() => setMembershipStatus(x.id, "paused"), "Plan paused.")}>Pause</Button>}
                    {opts.canAssign && x.status === "paused" && <Button size="sm" variant="ghost" onClick={() => run(() => setMembershipStatus(x.id, "active"), "Plan resumed.")}>Resume</Button>}
                    {opts.canAssign && (x.status === "active" || x.status === "paused") && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Cancel ${m.name}'s ${x.plan}? It stops renewing and can't be restarted.`)) run(() => setMembershipStatus(x.id, "cancelled"), "Plan cancelled."); }}>Cancel</Button>}
                  </span>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      )}

      {tab === "Bookings" && (
        <Card className="py-1">{d.bookings.length === 0 ? <p className="py-6 text-center text-sm text-muted">No bookings yet.</p> : (
          <ul className="divide-y text-sm">{d.bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span><b>{b.space}</b> <span className="text-muted">· {fmtIST(b.startsAt, { day: "numeric", month: "short" })}, {fmtIST(b.startsAt, { hour: "numeric", minute: "2-digit" })} to {fmtIST(b.endsAt, { hour: "numeric", minute: "2-digit" })}</span></span>
              <span className="flex items-center gap-2">{rupees(b.totalPaise)}<Badge tone={b.status === "confirmed" ? "green" : b.status === "cancelled" ? "red" : "grey"}>{b.status}</Badge></span>
            </li>
          ))}</ul>
        )}</Card>
      )}

      {tab === "Invoices" && (
        <Card className="py-1">{!opts.canAssign ? <p className="py-6 text-center text-sm text-muted">Invoices are visible to finance and managers.</p> : d.invoices.length === 0 ? <p className="py-6 text-center text-sm text-muted">No invoices yet.</p> : (
          <ul className="divide-y text-sm">{d.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link href={`/invoices/${i.id}`} className="font-medium text-accent hover:underline">{i.number}</Link>
              <span className="flex items-center gap-3 text-muted">{i.issueDate}<span className="text-fg">{rupees(i.totalPaise)}</span><Badge tone={INV_TONE[i.status]}>{INV_LABEL[i.status]}</Badge></span>
            </li>
          ))}</ul>
        )}</Card>
      )}

      {tab === "Activity" && (
        <Card className="py-1">{d.activity.length === 0 ? <p className="py-6 text-center text-sm text-muted">No recorded activity yet.</p> : (
          <ul className="divide-y text-sm">{d.activity.map((a) => <li key={a.id} className="flex justify-between gap-2 py-2.5"><span>{a.action}</span><span className="text-muted">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></li>)}</ul>
        )}</Card>
      )}

      {tab === "Access" && <Card><p className="font-medium">Door and desk access</p><p className="mt-1 text-sm text-muted">Coming soon. This will connect to your door-access system.</p></Card>}
      {tab === "Documents" && <Card><p className="font-medium">Documents</p><p className="mt-1 text-sm text-muted">Coming soon. Agreements and ID documents will be stored here.</p></Card>}
    </div>
  );
}
