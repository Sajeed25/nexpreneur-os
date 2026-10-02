"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listPayments, outstandingTotal, type PaymentRow } from "../invoices/actions";
import { rupees } from "@/lib/booking";

export function PaymentsApp() {
  const [rows, setRows] = React.useState<PaymentRow[]>([]);
  const [owed, setOwed] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let live = true;
    Promise.all([listPayments(), outstandingTotal()]).then(([p, o]) => {
      if (!live) return;
      setLoading(false);
      if (!p.ok) setError(p.error); else setRows(p.data);
      if (o.ok) setOwed(o.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load payments."); } });
    return () => { live = false; };
  }, []);

  const cols: Column<PaymentRow>[] = [
    { key: "at", header: "Date", render: (r) => new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
    { key: "inv", header: "Invoice", render: (r) => <span className="font-medium">{r.number}</span> },
    { key: "who", header: "Customer", render: (r) => r.who },
    { key: "m", header: "Method", render: (r) => <span className="capitalize">{r.method}</span> },
    { key: "amt", header: "Amount", render: (r) => rupees(r.amountPaise) },
    { key: "st", header: "Status", render: (r) => <Badge tone={r.status === "captured" ? "green" : "grey"}>{r.status}</Badge> },
  ];
  const search = React.useCallback((r: PaymentRow) => `${r.number} ${r.who} ${r.method}`, []);

  return (
    <>
      <PageHeader title="Payments" sub="Money received, and what's still outstanding." />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {owed !== null && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm text-muted">Outstanding</p><p className="text-2xl font-semibold tracking-tight">{rupees(owed)}</p></div>
          <Link href="/invoices" className="text-sm font-medium text-accent hover:underline">View invoices to pay or record payments</Link>
        </Card>
      )}
      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0
        ? <EmptyState title="No payments yet" hint="Payments appear here once an invoice is paid." />
        : <DataTable rows={rows} columns={cols} searchText={search} />}
    </>
  );
}
