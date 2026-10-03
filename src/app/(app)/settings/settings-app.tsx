"use client";
import * as React from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { addTeamMember, listAudit, listTeam, setActive, setRole, type AuditRow, type TeamRow } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function SettingsApp({ canGrantSuper }: { canGrantSuper: boolean }) {
  const [tab, setTab] = React.useState<"team" | "audit">("team");
  const [team, setTeam] = React.useState<TeamRow[]>([]);
  const [audit, setAudit] = React.useState<AuditRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [showAdd, setShowAdd] = React.useState(false);
  const roles = ROLES.filter((r) => canGrantSuper || r !== "super_admin");

  React.useEffect(() => {
    let live = true;
    Promise.all([listTeam(), listAudit()]).then(([t, a]) => {
      if (!live) return;
      setLoading(false);
      if (t.ok) { setError(null); setTeam(t.data); } else setError(t.error);
      if (a.ok) setAudit(a.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load settings."); } });
    return () => { live = false; };
  }, [tick]);

  const changeRole = async (u: TeamRow, role: string) => {
    if (!window.confirm(`Change ${u.name} to ${ROLE_LABEL[role as Role]}? Their access changes immediately.`)) { setTick((t) => t + 1); return; }
    const r = await setRole(u.id, role);
    if (!r.ok) setError(r.error); else setError(null);
    setTick((t) => t + 1);
  };
  const toggle = async (u: TeamRow) => {
    if (u.active && !window.confirm(`Deactivate ${u.name}? They'll be signed out and can't log in.`)) return;
    const r = await setActive(u.id, !u.active);
    if (!r.ok) setError(r.error); else { setError(null); setTick((t) => t + 1); }
  };
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await addTeamMember({ name: String(f.get("name")), email: String(f.get("email")), role: String(f.get("role")) as Role, password: String(f.get("password")) });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setShowAdd(false); setTick((t) => t + 1); }
  };

  return (
    <>
      <PageHeader title="Settings" sub="Your team and who can do what." actions={tab === "team" && <Button onClick={() => setShowAdd(!showAdd)}>Add team member</Button>} />
      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-xl border bg-surface p-1">
        {(["team", "audit"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-lg px-4 text-sm", tab === t ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{t === "team" ? "Team & roles" : "Audit log"}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {tab === "team" && <>
        {showAdd && (
          <Card className="mb-6">
            <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Name<input name="name" required minLength={2} className={field} /></label>
              <label className="text-sm font-medium">Email<input name="email" type="email" required className={field} /></label>
              <label className="text-sm font-medium">Role<select name="role" defaultValue="reception" className={field}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
              <label className="text-sm font-medium">Temporary password<input name="password" type="text" required minLength={8} maxLength={72} autoComplete="off" className={field} /></label>
              <p className="text-xs text-muted sm:col-span-2">Share the temporary password privately. They can change it on their Profile page after signing in.</p>
              <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Adding…" : "Add member"}</Button>
            </form>
          </Card>
        )}
        {loading ? <p className="text-sm text-muted">Loading…</p> : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Person</th><th>Role</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
              <tbody>{team.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3"><p className="font-medium">{u.name}{u.isMe && <span className="text-muted"> (you)</span>}</p><p className="text-xs text-muted">{u.email}</p></td>
                  <td>
                    <select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.isMe || (u.role === "super_admin" && !canGrantSuper)} onChange={(e) => changeRole(u, e.target.value)} className="h-9 rounded-lg border bg-bg px-2 disabled:opacity-60">
                      {ROLES.filter((r) => roles.includes(r) || r === u.role).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never"}</td>
                  <td><Badge tone={u.active ? "green" : "grey"}>{u.active ? "Active" : "Deactivated"}</Badge></td>
                  <td className="pr-4 text-right">{!u.isMe && <Button variant="ghost" size="sm" onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Reactivate"}</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </>}

      {tab === "audit" && (
        <Card className="py-1">
          {audit.length === 0 ? <p className="py-6 text-center text-sm text-muted">No activity yet.</p> : (
            <ul className="divide-y text-sm">{audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span><span className="font-medium">{a.who}</span> <span className="text-muted">{a.action}</span></span><span className="text-xs text-muted">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></li>
            ))}</ul>
          )}
        </Card>
      )}
    </>
  );
}
