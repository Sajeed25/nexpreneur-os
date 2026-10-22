"use client";
import * as React from "react";
import { Badge, Button, Card } from "@/components/ui";
import { getBusiness, getIntegrations, getPolicies, saveBusiness, savePolicies, type BusinessDTO, type IntegrationsData, type PoliciesDTO } from "./business";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
type Msg = { kind: "ok" | "err"; text: string } | null;
const Note = ({ m }: { m: Msg }) => m && (
  <p role={m.kind === "err" ? "alert" : "status"} className={m.kind === "err" ? "rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400" : "rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"}>{m.text}</p>
);

export function BusinessTab() {
  const [b, setB] = React.useState<BusinessDTO | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { getBusiness().then((r) => (r.ok ? setB(r.data) : setMsg({ kind: "err", text: r.error }))); }, []);
  if (!b) return <Note m={msg} />;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "");
    setBusy(true); setMsg(null);
    const r = await saveBusiness({ legalName: g("legalName"), gstin: g("gstin"), address: g("address"), pincode: g("pincode"), stateCode: g("stateCode"), phone: g("phone"), email: g("email") });
    setBusy(false);
    setMsg(r.ok ? { kind: "ok", text: "Saved. New invoices and e-invoices use these details." } : { kind: "err", text: r.error });
  };
  return (
    <Card>
      <h2 className="font-medium">Business profile</h2>
      <p className="mb-4 text-sm text-muted">Printed on every invoice and sent as the seller in e-invoices. A location can have its own details under Locations.</p>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Legal name<input name="legalName" defaultValue={b.legalName} maxLength={160} className={field} placeholder={b.name} /></label>
        <label className="text-sm font-medium">GSTIN<input name="gstin" defaultValue={b.gstin} maxLength={15} className={field} style={{ textTransform: "uppercase" }} placeholder="36AABCN1234F1Z5" /></label>
        <label className="text-sm font-medium">State (if no GSTIN)<select name="stateCode" defaultValue={b.stateCode} className={field}><option value="">From GSTIN</option>{b.states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}</select></label>
        <label className="text-sm font-medium sm:col-span-2">Address<textarea name="address" defaultValue={b.address} maxLength={500} rows={2} className={field + " h-auto py-2"} placeholder="Plot 5, Madhapur, Hyderabad" /></label>
        <label className="text-sm font-medium">PIN code<input name="pincode" defaultValue={b.pincode} inputMode="numeric" maxLength={6} className={field} placeholder="500081" /></label>
        <label className="text-sm font-medium">Phone<input name="phone" defaultValue={b.phone} maxLength={20} className={field} /></label>
        <label className="text-sm font-medium sm:col-span-2">Email<input name="email" type="email" defaultValue={b.email} maxLength={190} className={field} /></label>
        <div className="space-y-3 sm:col-span-2"><Note m={msg} /><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save business profile"}</Button></div>
      </form>
    </Card>
  );
}

export function PoliciesTab() {
  const [p, setP] = React.useState<PoliciesDTO | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { getPolicies().then((r) => (r.ok ? setP(r.data) : setMsg({ kind: "err", text: r.error }))); }, []);
  if (!p) return <Note m={msg} />;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setMsg(null);
    const r = await savePolicies({
      refundApprovalRupees: Math.round(Number(f.get("refund") || 0)), require2faRoles: p.require2faRoles, onboardingItems: p.onboardingItems,
      onboardingBlocks: p.onboardingBlocks, agreementText: String(f.get("agreement") ?? ""),
    });
    setBusy(false);
    setMsg(r.ok ? { kind: "ok", text: "Policies saved." } : { kind: "err", text: r.error });
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-medium">Refund approvals</h2>
        <p className="text-sm text-muted">Refunds at or above this amount need a second person (a manager other than whoever asked) to approve before the money goes back. Set 0 to turn this off.</p>
        <label className="block max-w-xs text-sm font-medium">Approval needed from (₹)<input name="refund" type="number" min="0" step="1" defaultValue={p.refundApprovalRupees} className={field} /></label>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Two-factor sign-in</h2>
        <p className="text-sm text-muted">People in these roles must set up an authenticator app. They can keep using the app until they do, but only the security page until then.</p>
        <div className="flex flex-wrap gap-2">{p.twoFaRoles.map((r) => (
          <label key={r.id} className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${p.require2faRoles.includes(r.id) ? "border-accent bg-accent-soft" : ""}`}>
            <input type="checkbox" checked={p.require2faRoles.includes(r.id)} onChange={() => setP({ ...p, require2faRoles: toggle(p.require2faRoles, r.id) })} />{r.label}
          </label>
        ))}</div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-medium">Member onboarding</h2>
        <p className="text-sm text-muted">Steps every new member completes. You can tick them off on the member&apos;s page; some tick themselves.</p>
        <div className="flex flex-wrap gap-2">{p.items.map((it) => (
          <label key={it.id} className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${p.onboardingItems.includes(it.id) ? "border-accent bg-accent-soft" : ""}`}>
            <input type="checkbox" checked={p.onboardingItems.includes(it.id)} onChange={() => setP({ ...p, onboardingItems: toggle(p.onboardingItems, it.id) })} />{it.label}
          </label>
        ))}</div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={p.onboardingBlocks} onChange={(e) => setP({ ...p, onboardingBlocks: e.target.checked })} /><span><b>Don&apos;t let members book or enter until onboarding is complete.</b><br /><span className="text-muted">Members see what is left to do. Staff are never blocked.</span></span></label>
        <label className="block text-sm font-medium">Membership agreement (shown to members to accept)<textarea name="agreement" rows={7} maxLength={4000} defaultValue={p.agreementText || p.agreementDefault} className={field + " h-auto py-2"} /></label>
      </Card>
      <Note m={msg} />
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save policies"}</Button>
    </form>
  );
}

export function IntegrationsTab() {
  const [d, setD] = React.useState<IntegrationsData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { getIntegrations().then((r) => (r.ok ? setD(r.data) : setErr(r.error))); }, []);
  if (err) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{err}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  const sent = (ch: string, st: string) => d.outbox.find((o) => o.channel === ch && o.status === st)?.n ?? 0;
  return (
    <div className="space-y-4">
      <Card className="py-1">
        <ul className="divide-y text-sm">{d.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div><p className="font-medium">{i.name}</p><p className="text-muted">{i.detail}</p></div>
            <Badge tone={i.ok ? "green" : "grey"}>{i.ok ? "Connected" : "Not set up"}</Badge>
          </li>
        ))}</ul>
      </Card>
      <Card>
        <h2 className="font-medium">Messages in the last 7 days</h2>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          {(["whatsapp", "sms", "push"] as const).map((ch) => (
            <div key={ch} className="rounded-xl border p-3"><p className="text-muted capitalize">{ch === "sms" ? "SMS" : ch}</p><p className="text-xl font-semibold">{sent(ch, "sent")}<span className="text-sm font-normal text-muted"> sent</span></p>{(sent(ch, "failed") > 0 || sent(ch, "queued") > 0) && <p className="text-xs text-amber-700 dark:text-amber-300">{sent(ch, "failed")} failed · {sent(ch, "queued")} waiting</p>}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}
