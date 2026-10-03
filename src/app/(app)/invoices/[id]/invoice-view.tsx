"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Printer } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { confirmRazorpayPayment, createRazorpayOrder, getInvoice, onlinePaymentsEnabled, recordPayment, voidInvoice, type InvoiceDetail } from "../actions";
import { refundPayment, sendInvoiceEmail } from "../extras";
import { INV_LABEL, INV_TONE, displayStatus } from "@/lib/billing";
import { rupees, todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

type RzpOptions = { key: string; amount: number; currency: string; order_id: string; name: string; description: string; handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void; modal?: { ondismiss?: () => void } };
declare global { interface Window { Razorpay?: new (o: RzpOptions) => { open: () => void } } }

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function InvoiceView({ id, finance, manager }: { id: string; finance: boolean; manager: boolean }) {
  const [d, setD] = React.useState<InvoiceDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [online, setOnline] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [refunding, setRefunding] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    Promise.all([getInvoice(id), onlinePaymentsEnabled()]).then(([r, o]) => {
      if (!live) return;
      if (!r.ok) setError(r.error); else { setError(null); setD(r.data); }
      setOnline(o);
    }).catch(() => live && setError("Couldn't load the invoice."));
    return () => { live = false; };
  }, [id, tick]);

  if (error && !d) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;

  const i = d.invoice;
  const due = i.totalPaise - i.paidPaise;
  const st = displayStatus(i, todayIST());
  const canPay = i.status !== "void" && i.status !== "paid" && due > 0;

  const record = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await recordPayment({ invoiceId: i.id, amount: Number(f.get("amount")), method: String(f.get("method")) as "cash", note: String(f.get("note") ?? "") || undefined });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setInfo("Payment recorded."); setTick((t) => t + 1); }
  };
  const refund = async (e: React.FormEvent<HTMLFormElement>, paymentId: string) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setInfo(null);
    const r = await refundPayment({ paymentId, amount: Number(f.get("amount")), reason: String(f.get("reason") ?? "") });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setRefunding(null); setInfo("Refund recorded."); setTick((t) => t + 1); }
  };
  const payOnline = async () => {
    setBusy(true); setError(null);
    const o = await createRazorpayOrder(i.id);
    if (!o.ok) { setBusy(false); setError(o.error); return; }
    if (!(await loadRazorpay()) || !window.Razorpay) { setBusy(false); setError("Couldn't load the payment window."); return; }
    new window.Razorpay({
      key: o.data.keyId, amount: o.data.amountPaise, currency: "INR", order_id: o.data.orderId, name: d.seller.name, description: `Invoice ${o.data.number}`,
      handler: async (resp) => {
        const c = await confirmRazorpayPayment({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
        setBusy(false);
        if (!c.ok) setError(c.error); else { setInfo("Payment received. Thank you!"); setTick((t) => t + 1); }
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  };
  const doVoid = async () => {
    if (!window.confirm("Void this invoice? This can't be undone.")) return;
    const r = await voidInvoice(i.id);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };
  const email = async () => {
    setBusy(true); setInfo(null);
    const r = await sendInvoiceEmail(i.id);
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setInfo(`Invoice emailed to ${d.customer.email}.`); setTick((t) => t + 1); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/invoices" className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Invoices</Link>
        <div className="flex gap-2">
          {finance && d.canEmail && <Button variant="secondary" size="sm" onClick={email} disabled={busy}><Mail size={16} />{i.emailedAt ? "Email again" : "Email invoice"}</Button>}
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={16} />Print / Save as PDF</Button>
        </div>
      </div>
      {error && <p role="alert" className="no-print rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p className="no-print rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      <Card className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tax Invoice</h1>
            <p className="text-muted">{i.number}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{d.seller.name}</p>
            {d.seller.gstin && <p className="text-muted">GSTIN {d.seller.gstin}</p>}
            <div className="mt-2"><Badge tone={INV_TONE[st]}>{INV_LABEL[st]}</Badge></div>
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted">Billed to</p>
            {d.company && <p className="font-medium">{d.company.name}</p>}
            <p className={d.company ? "" : "font-medium"}>{d.customer.name}</p><p>{d.customer.email}</p>
            {(i.buyerGstin || d.company?.gstin) && <p>GSTIN {i.buyerGstin ?? d.company?.gstin}</p>}
          </div>
          <div><p className="text-muted">Issued</p><p className="font-medium">{i.issueDate}</p></div>
          <div><p className="text-muted">Due</p><p className="font-medium">{i.dueDate}</p><p className="text-muted">Place of supply: {i.placeOfSupply}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-2">Description</th><th>SAC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{d.items.map((x) => (
              <tr key={x.id} className="border-t"><td className="py-2">{x.description}</td><td>{x.hsnSac}</td><td className="text-right">{x.qty}</td><td className="text-right">{rupees(x.unitPaise)}</td><td className="text-right">{x.taxPct}%</td><td className="text-right">{rupees(x.qty * x.unitPaise)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{rupees(i.subtotalPaise)}</dd></div>
          {i.discountPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Discount{i.couponCode ? ` (${i.couponCode})` : ""}</dt><dd>-{rupees(i.discountPaise)}</dd></div>}
          {i.igstPaise > 0 ? <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{rupees(i.igstPaise)}</dd></div> : <>
            <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{rupees(i.cgstPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{rupees(i.sgstPaise)}</dd></div></>}
          <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Total</dt><dd>{rupees(i.totalPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{rupees(i.paidPaise)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{rupees(due)}</dd></div>
        </dl>
        {d.payments.length > 0 && (
          <div className="text-sm"><p className="mb-1 font-medium">Payments</p>
            <ul className="space-y-2">{d.payments.map((p) => {
              const left = p.amountPaise - p.refundedPaise;
              return (
                <li key={p.id} className="text-muted">
                  {new Date(p.at).toLocaleDateString("en-IN")} · {rupees(p.amountPaise)} · {p.method}{p.note ? ` · ${p.note}` : ""}
                  {p.refundedPaise > 0 && <span className="text-red-600"> · refunded {rupees(p.refundedPaise)}</span>}
                  {finance && left > 0 && <button onClick={() => setRefunding(refunding === p.id ? null : p.id)} className="no-print ml-2 text-accent hover:underline">Refund</button>}
                  {refunding === p.id && (
                    <form onSubmit={(e) => refund(e, p.id)} className="no-print mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-[120px_1fr_auto]">
                      <input name="amount" type="number" min="0.01" step="0.01" max={left / 100} defaultValue={left / 100} required aria-label="Refund amount in rupees" className={field + " mt-0"} />
                      <input name="reason" maxLength={255} placeholder="Reason (optional)" aria-label="Reason" className={field + " mt-0"} />
                      <Button type="submit" size="sm" disabled={busy}>{busy ? "Refunding…" : "Refund"}</Button>
                      <p className="text-xs sm:col-span-3">{p.method === "razorpay" ? "This is sent back to the customer's card/UPI through Razorpay." : "Hand the money back yourself; this records it."}</p>
                    </form>
                  )}
                </li>
              );
            })}</ul>
          </div>
        )}
      </Card>

      {canPay && (
        <Card className="no-print space-y-4">
          <h2 className="font-medium">Pay this invoice</h2>
          {online
            ? <Button onClick={payOnline} disabled={busy} className="w-full sm:w-auto">{busy ? "Opening…" : `Pay ${rupees(due)} online`}</Button>
            : <p className="text-sm text-muted">Online payment isn&apos;t enabled yet. Please pay at reception.</p>}
          {finance && (
            <form onSubmit={record} className="grid gap-3 border-t pt-4 sm:grid-cols-4">
              <label className="text-sm font-medium">Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" max={due / 100} defaultValue={due / 100} required className={field} /></label>
              <label className="text-sm font-medium">Method<select name="method" className={field}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="card">Card</option></select></label>
              <label className="text-sm font-medium sm:col-span-2">Note<input name="note" maxLength={255} className={field} placeholder="Reference / UTR" /></label>
              <Button type="submit" variant="secondary" disabled={busy} className="sm:col-span-4 sm:w-fit">Record payment</Button>
            </form>
          )}
          {manager && i.paidPaise === 0 && <Button variant="ghost" size="sm" onClick={doVoid}>Void invoice</Button>}
        </Card>
      )}
    </div>
  );
}
