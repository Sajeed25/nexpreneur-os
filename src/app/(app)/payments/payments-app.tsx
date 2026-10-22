"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listPayments, outstandingTotal, type PaymentRow } from "../invoices/actions";
import { cancelRefundRequest, decideRefundRequest, listRefundRequests, type RefundRequestDTO } from "../invoices/extras";
import { rupees } from "@/lib/booking";

const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", card: "Card", razorpay: "Online", tds: "TDS deducted", credit_note: "Credit note" };

export function PaymentsApp({ viewerId }: { viewerId: string }) {
  const [rows, setRows] = React.useState<PaymentRow[]>([]);
  const [owed, setOwed] = React.useState<number | null>(null);
  const [reqs, setReqs] = React.useState<RefundRequestDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    Promise.all([listPayments(), outstandingTotal(), listRefundRequests()]).then(([p, o, q]) => {
      if (!live) return;
      setLoading(false);
      if (!p.ok) setError(p.error); else setRows(p.data);
      if (o.ok) setOwed(o.data);
      if (q.ok) setReqs(q.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load payments."); } });
    return () => { live = false; };
  }, [tick]);

  const decide = async (r: RefundRequestDTO, approve: boolean) => {
    const note = approve ? "" : (window.prompt("Why are you declining? (optional)") ?? "");
    setBusy(true); setInfo(null);
    const res = await decideRefundRequest(r.id, approve, note);
    setBusy(false);
    if (!res.ok) setError(res.error); else { setError(null); setInfo(approve ? "Approved and refunded." : "Declined."); setTick((t) => t + 1); }
  };
  const withdraw = async (r: RefundRequestDTO) => {
    setBusy(true);
    const res = await cancelRefundRequest(r.id);
    setBusy(false);
    if (!res.ok) setError(res.error); else { setError(null); setInfo("Request withdrawn."); setTick((t) => t + 1); }
  };

  const cols: Column<PaymentRow>[] = [
    { key: "at", header: "Date", render: (r) => new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
    { key: "inv", header: "Invoice", render: (r) => <span className="font-medium">{r.number}</span> },
    { key: "who", header: "Customer", render: (r) => r.who },
    { key: "m", header: "Method", render: (r) => METHOD[r.method] ?? r.method },
    { key: "amt", header: "Amount", render: (r) => rupees(r.amountPaise) },
    { key: "st", header: "Status", render: (r) => <Badge tone={r.status === "captured" ? "green" : "grey"}>{r.status}</Badge> },
  ];
  const search = React.useCallback((r: PaymentRow) => `${r.number} ${r.who} ${METHOD[r.method] ?? r.method}`, []);

  return (
    <>
      <PageHeader title="Payments" sub="Money received, and what's still outstanding." />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}
      {owed !== null && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm text-muted">Outstanding</p><p className="text-2xl font-semibold tracking-tight">{rupees(owed)}</p></div>
          <Link href="/invoices" className="text-sm font-medium text-accent hover:underline">View invoices to pay or record payments</Link>
        </Card>
      )}

      {reqs.length > 0 && (
        <Card className="mb-6 space-y-3">
          <div><h2 className="font-medium">Refund approvals</h2><p className="text-sm text-muted">Large refunds wait here until a manager other than the person who asked approves them.</p></div>
          <ul className="divide-y text-sm">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p><Link href={`/invoices/${r.invoiceId}`} className="font-medium text-accent hover:underline">{r.invoiceNumber}</Link> · {r.customer} · <b>{rupees(r.amountPaise)}</b></p>
                  <p className="text-muted">Asked by {r.requestedById === viewerId ? "you" : r.requestedBy} on {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{r.reason ? ` · ${r.reason}` : ""}</p>
                  {r.selfOnly && <p className="text-xs text-amber-700 dark:text-amber-300">You&apos;re the only manager, so you can approve your own request. It is recorded in the audit log.</p>}
                </div>
                <div className="flex gap-2">
                  {r.canDecide && <><Button size="sm" disabled={busy} onClick={() => decide(r, true)}>Approve & refund</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => decide(r, false)}>Decline</Button></>}
                  {r.requestedById === viewerId && <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(r)}>Withdraw</Button>}
                  {!r.canDecide && r.requestedById !== viewerId && <Badge tone="amber">Waiting for a manager</Badge>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0
        ? <EmptyState title="No payments yet" hint="Payments appear here once an invoice is paid." />
        : <DataTable rows={rows} columns={cols} searchText={search} />}
    </>
  );
}
