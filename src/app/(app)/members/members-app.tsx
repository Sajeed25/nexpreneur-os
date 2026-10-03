"use client";
import * as React from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { rupees } from "@/lib/booking";
import { addMember, listMembers, memberOptions, type MemberOptions, type MemberRow } from "./actions";
import { MemberForm } from "./member-form";

const planTone = (s: string | null) => (({ active: "green", paused: "amber", cancelled: "red", expired: "grey" }) as const)[(s ?? "") as "active"] ?? "grey";

export function MembersApp() {
  const { loc, locations } = useLocation();
  const [rows, setRows] = React.useState<MemberRow[]>([]);
  const [opts, setOpts] = React.useState<MemberOptions | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; href?: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [status, setStatus] = React.useState("active");
  const [plan, setPlan] = React.useState("");

  React.useEffect(() => {
    let live = true;
    Promise.all([listMembers(), memberOptions()]).then(([m, o]) => {
      if (!live) return;
      setLoading(false);
      if (m.ok) { setError(null); setRows(m.data); } else setError(m.error);
      if (o.ok) setOpts(o.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load members."); } });
    return () => { live = false; };
  }, [tick]);

  const shown = React.useMemo(() => rows.filter((m) =>
    (status === "all" || (status === "active" ? m.active : !m.active)) &&
    // A member with no home location shows in every view; one with a location shows only in that location (or All).
    (loc === "all" || !m.locationId || m.locationId === loc) &&
    (!plan || (plan === "none" ? !m.plan : m.planStatus === plan))),
  [rows, loc, status, plan]);

  const cols: Column<MemberRow>[] = [
    { key: "name", header: "Member", render: (m) => (
      <Link href={`/members/${m.id}`} className="flex items-center gap-3"><Avatar name={m.name} />
        <span><span className="block font-medium hover:text-accent">{m.name}</span><span className="text-xs text-muted">{m.email}</span></span></Link>
    ) },
    { key: "company", header: "Company", render: (m) => m.company || <span className="text-muted">—</span> },
    { key: "plan", header: "Plan", render: (m) => m.plan ? <span className="flex items-center gap-2">{m.plan}<Badge tone={planTone(m.planStatus)}>{m.planStatus}</Badge></span> : <span className="text-muted">No plan</span> },
    { key: "loc", header: "Location", render: (m) => m.locationName || <span className="text-muted">—</span> },
    { key: "renew", header: "Renewal", render: (m) => m.renewalDate ?? <span className="text-muted">—</span> },
    ...(opts?.canAssign ? [{ key: "owed", header: "Owes", render: (m: MemberRow) => m.owedPaise > 0 ? <span className="font-medium text-red-600">{rupees(m.owedPaise)}</span> : <span className="text-muted">—</span> }] : []),
    { key: "st", header: "Status", render: (m) => <Badge tone={m.active ? "green" : "grey"}>{m.active ? "Active" : "Deactivated"}</Badge> },
  ];
  const search = React.useCallback((m: MemberRow) => `${m.name} ${m.email} ${m.company} ${m.plan ?? ""} ${m.phone}`, []);

  return (
    <>
      <PageHeader title="Members" sub={`${rows.filter((r) => r.active).length} active members. Staff accounts are managed in Settings.`}
        actions={opts?.canEdit && <Button onClick={() => setAdding(!adding)}><UserPlus size={18} />Add member</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{notice.text} {notice.href && <Link href={notice.href} className="font-medium underline">View</Link>}</p>}

      {adding && opts && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Add a member</h2>
          <MemberForm opts={opts} mode="add" busy={busy} defaultLocation={locations.some((l) => l.id === loc) ? loc : undefined} onCancel={() => setAdding(false)}
            onSubmit={async (v) => {
              setBusy(true);
              const r = await addMember({ ...v, planId: v.planId || undefined, startDate: v.startDate || undefined, couponCode: v.couponCode || undefined, password: v.access === "password" ? v.password : undefined });
              setBusy(false);
              if (!r.ok) { setError(r.error); return; }
              setError(null); setAdding(false); setTick((t) => t + 1);
              setNotice({ text: `${v.name} was added${r.data.invited ? " and an invitation email was sent" : ""}.${r.data.note ? " " + r.data.note : ""}`, href: r.data.invoiceId ? `/invoices/${r.data.invoiceId}` : `/members/${r.data.id}` });
            }} />
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="No members yet" hint={opts?.canEdit ? "Use “Add member”, or share the sign-up link so people can register themselves." : "Members will appear here."} />
      ) : (
        <DataTable rows={shown} columns={cols} searchText={search}
          filters={<>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="h-10 rounded-xl border bg-bg px-3 text-sm">
              <option value="active">Active</option><option value="inactive">Deactivated</option><option value="all">All</option>
            </select>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Filter by plan" className="h-10 rounded-xl border bg-bg px-3 text-sm">
              <option value="">Any plan</option><option value="active">Plan active</option><option value="paused">Plan paused</option><option value="cancelled">Plan cancelled</option><option value="none">No plan</option>
            </select>
          </>} />
      )}
    </>
  );
}
