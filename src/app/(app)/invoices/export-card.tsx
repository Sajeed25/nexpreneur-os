"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const FILES = [
  { kind: "tally", label: "Tally (XML)", hint: "Customers, sales, receipts and credit notes for Tally Prime." },
  { kind: "zoho", label: "Zoho Books (CSV)", hint: "One row per invoice line, for Zoho's invoice import." },
  { kind: "gst", label: "GST sales register (CSV)", hint: "Rate-wise, B2B and B2C, with credit notes: the working for GSTR-1." },
  { kind: "payments", label: "Payments (CSV)", hint: "Everything received, with refunds, for bank reconciliation." },
] as const;

/** Accounting downloads for finance. The files are built on the server for the chosen dates. */
export function ExportCard() {
  const [open, setOpen] = React.useState(false);
  const today = todayIST();
  const [from, setFrom] = React.useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = React.useState(today);
  const q = new URLSearchParams({ from, to }).toString();
  return (
    <Card className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-medium">Export for your accountant</h2><p className="text-sm text-muted">Download invoices, credit notes and payments in the format your accounting software reads.</p></div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}><Download size={16} />{open ? "Hide" : "Export"}</Button>
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field + " w-44"} /></label>
            <label className="text-sm font-medium">To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field + " w-44"} /></label>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {FILES.map((f) => (
              <li key={f.kind} className="rounded-xl border p-3"><a href={`/api/export/${f.kind}?${q}`} className="font-medium text-accent hover:underline">{f.label}</a><p className="text-xs text-muted">{f.hint}</p></li>
            ))}
          </ul>
          <p className="text-xs text-muted">Voided invoices are left out. Check the first import against a few invoices before you rely on it. Account names (Sales, Output CGST, Bank Account…) follow Tally&apos;s common defaults.</p>
        </>
      )}
    </Card>
  );
}
