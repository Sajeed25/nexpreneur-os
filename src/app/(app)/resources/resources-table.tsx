"use client";
import * as React from "react";
import { Badge, statusTone } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { RESOURCES, type Resource } from "@/lib/demo-data";

const COLS: Column<Resource>[] = [
  { key: "name", header: "Resource", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "type", header: "Type", render: (r) => r.type },
  { key: "cap", header: "Capacity", render: (r) => r.capacity },
  { key: "price", header: "Price", render: (r) => r.price },
  { key: "status", header: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
];

export function ResourcesTable() {
  const { loc } = useLocation();
  const rows = React.useMemo(() => RESOURCES.filter((r) => loc === "all" || r.location === loc), [loc]);
  const search = React.useCallback((r: Resource) => `${r.name} ${r.type} ${r.status}`, []);
  return <DataTable rows={rows} columns={COLS} searchText={search} />;
}
