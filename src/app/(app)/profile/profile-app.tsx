"use client";
import * as React from "react";
import { Avatar, Badge, Button, Card, PageHeader } from "@/components/ui";
import { changePassword, getProfile, updateProfile, type ProfileDTO } from "./actions";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
type Msg = { kind: "ok" | "err"; text: string } | null;
const Note = ({ m }: { m: Msg }) => m && (
  <p role={m.kind === "err" ? "alert" : "status"} className={m.kind === "err" ? "rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400" : "rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"}>{m.text}</p>
);

export function ProfileApp() {
  const [p, setP] = React.useState<ProfileDTO | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [m1, setM1] = React.useState<Msg>(null);
  const [m2, setM2] = React.useState<Msg>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    getProfile().then((r) => (r.ok ? setP(r.data) : setErr(r.error))).catch(() => setErr("Couldn't load your profile."));
  }, []);

  if (err) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{err}</p>;
  if (!p) return <p className="text-sm text-muted">Loading…</p>;

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "");
    setBusy(true); setM1(null);
    const r = await updateProfile({ name: g("name"), phone: g("phone"), jobTitle: g("jobTitle"), company: g("company"), emergencyName: g("emergencyName"), emergencyPhone: g("emergencyPhone") });
    setBusy(false);
    setM1(r.ok ? { kind: "ok", text: "Profile saved." } : { kind: "err", text: r.error });
  };
  const pw = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setM2(null);
    const r = await changePassword({ current: String(f.get("current")), next: String(f.get("next")) });
    setBusy(false);
    if (r.ok) form.reset();
    setM2(r.ok ? { kind: "ok", text: "Password changed." } : { kind: "err", text: r.error });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" sub="Your details and security." />
      <Card className="flex items-center gap-4">
        <Avatar name={p.name} size={56} />
        <div className="min-w-0"><p className="truncate text-lg font-semibold">{p.name}</p><p className="truncate text-muted">{p.email}</p></div>
        <div className="ml-auto"><Badge tone="blue">{ROLE_LABEL[p.role as Role] ?? p.role}</Badge></div>
      </Card>

      <Card>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Full name<input name="name" defaultValue={p.name} required minLength={2} maxLength={160} className={field} /></label>
          <label className="text-sm font-medium">Phone<input name="phone" type="tel" defaultValue={p.phone} maxLength={20} className={field} /></label>
          <label className="text-sm font-medium">Job title<input name="jobTitle" defaultValue={p.jobTitle} maxLength={120} className={field} /></label>
          <label className="text-sm font-medium sm:col-span-2">Company<input name="company" defaultValue={p.company} maxLength={160} className={field} /></label>
          <label className="text-sm font-medium">Emergency contact name<input name="emergencyName" defaultValue={p.emergencyName} maxLength={120} className={field} /></label>
          <label className="text-sm font-medium">Emergency contact phone<input name="emergencyPhone" type="tel" defaultValue={p.emergencyPhone} maxLength={20} className={field} /></label>
          <div className="space-y-3 sm:col-span-2"><Note m={m1} /><Button type="submit" disabled={busy}>Save changes</Button></div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 font-medium">Change password</h2>
        <form onSubmit={pw} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Current password<input name="current" type="password" autoComplete="current-password" required className={field} /></label>
          <label className="text-sm font-medium">New password<input name="next" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className={field} /></label>
          <div className="space-y-3 sm:col-span-2"><Note m={m2} /><Button type="submit" variant="secondary" disabled={busy}>Update password</Button></div>
        </form>
      </Card>
    </div>
  );
}
