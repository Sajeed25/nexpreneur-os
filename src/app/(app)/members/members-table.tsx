"use client";
import * as React from "react";
import { Avatar, Badge, statusTone } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { LOCATIONS, MEMBERS, type Member } from "@/lib/demo-data";

const COLS: Column<Member>[] = [
  { key: "name", header: "Member", render: (m) => (
    <div className="flex items-center gap-3"><Avatar name={m.name} /><div><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.email}</p></div></div>
  ) },
  { key: "company", header: "Company", render: (m) => m.company },
  { key: "plan", header: "Plan", render: (m) => m.plan },
  { key: "location", header: "Location", render: (m) => LOCATIONS.find((l) => l.id === m.location)?.name },
  { key: "status", header: "Status", render: (m) => <Badge tone={statusTone(m.status)}>{m.status}</Badge> },
  { key: "renewal", header: "Renewal", render: (m) => m.renewal },
  { key: "payment", header: "Payment", render: (m) => <Badge tone={statusTone(m.payment)}>{m.payment}</Badge> },
];

export function MembersTable() {
  const { loc } = useLocation();
  const [status, setStatus] = React.useState("");
  const rows = React.useMemo(
    () => MEMBERS.filter((m) => (loc === "all" || m.location === loc) && (!status || m.status === status)),
    [loc, status],
  );
  const search = React.useCallback((m: Member) => `${m.name} ${m.email} ${m.company} ${m.plan}`, []);
  return (
    <DataTable rows={rows} columns={COLS} searchText={search}
      filters={
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="h-10 rounded-xl border bg-bg px-3 text-sm">
          <option value="">All statuses</option>
          {["Active", "Trial", "Expiring", "Paused"].map((s) => <option key={s}>{s}</option>)}
        </select>
      } />
  );
}
