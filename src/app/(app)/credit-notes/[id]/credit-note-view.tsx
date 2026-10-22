"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getCreditNote, type CreditNoteDetail } from "../../invoices/settlements";
import { rupees } from "@/lib/booking";

export function CreditNoteView({ id }: { id: string }) {
  const [d, setD] = React.useState<CreditNoteDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    getCreditNote(id).then((r) => (r.ok ? setD(r.data) : setError(r.error))).catch(() => setError("Couldn't load the credit note."));
  }, [id]);
  if (error) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  const s = d.seller;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href={`/invoices/${d.invoiceId}`} className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Invoice {d.invoiceNumber}</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={16} />Print / Save as PDF</Button>
      </div>
      <Card className="space-y-6 p-6 sm:p-8" style={s.brandColor ? { borderTop: `4px solid ${s.brandColor}` } : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight">Credit Note</h1><p className="text-muted">{d.number}</p></div>
          <div className="text-right text-sm">
            {s.logoImageId && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/images/${s.logoImageId}`} alt="" className="mb-2 ml-auto max-h-12 w-auto" />}
            <p className="font-semibold">{s.name}</p>
            {s.gstin && <p className="text-muted">GSTIN {s.gstin}</p>}
            {s.address && <p className="max-w-[260px] text-muted">{s.address}{s.pincode ? ` ${s.pincode}` : ""}</p>}
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div><p className="text-muted">Issued to</p>{d.customer.company && <p className="font-medium">{d.customer.company}</p>}<p className={d.customer.company ? "" : "font-medium"}>{d.customer.name}</p><p>{d.customer.email}</p>{d.customer.gstin && <p>GSTIN {d.customer.gstin}</p>}</div>
          <div><p className="text-muted">Date</p><p className="font-medium">{d.issueDate}</p></div>
          <div><p className="text-muted">Against invoice</p><p className="font-medium">{d.invoiceNumber}</p><p className="text-muted">dated {d.invoiceDate}</p></div>
        </div>
        {d.reason && <p className="text-sm"><span className="text-muted">Reason: </span>{d.reason}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-2">Description</th><th>SAC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{d.items.map((it, n) => <tr key={n} className="border-t"><td className="py-2">{it.description}</td><td>{it.hsnSac}</td><td className="text-right">{it.qty}</td><td className="text-right">{rupees(it.unitPaise)}</td><td className="text-right">{it.taxPct}%</td><td className="text-right">{rupees(it.qty * it.unitPaise)}</td></tr>)}</tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd>{rupees(d.subtotalPaise)}</dd></div>
          {d.igstPaise > 0 ? <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{rupees(d.igstPaise)}</dd></div> : <><div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{rupees(d.cgstPaise)}</dd></div><div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{rupees(d.sgstPaise)}</dd></div></>}
          <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Total credited</dt><dd>{rupees(d.totalPaise)}</dd></div>
        </dl>
        {s.footer && <p className="border-t pt-3 text-xs text-muted">{s.footer}</p>}
      </Card>
    </div>
  );
}
