"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Link2, Mail, Printer } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { confirmRazorpayPayment, createRazorpayOrder, getInvoice, onlinePaymentsEnabled, recordPayment, voidInvoice, type InvoiceDetail } from "../actions";
import { refundPayment, sendInvoiceEmail } from "../extras";
import { sendPayLink } from "../paylink";
import { cancelEInvoice, createCreditNote, generateEInvoice, getInvoiceExtras, recordTds, type InvoiceExtras } from "../settlements";
import { INV_LABEL, INV_TONE, displayStatus, gst } from "@/lib/billing";
import { rupees, todayIST } from "@/lib/booking";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const METHOD: Record<string, string> = { cash: "cash", upi: "UPI", bank: "bank transfer", card: "card", razorpay: "online", tds: "TDS deducted", credit_note: "credit note" };

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

type CnLine = { description: string; qty: number; price: number; taxPct: 0 | 5 | 12 | 18 | 28 };
type Panel = "tds" | "credit" | "einv" | null;

export function InvoiceView({ id, finance, manager }: { id: string; finance: boolean; manager: boolean }) {
  const [d, setD] = React.useState<InvoiceDetail | null>(null);
  const [x, setX] = React.useState<InvoiceExtras | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [online, setOnline] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [refunding, setRefunding] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<Panel>(null);
  const [cn, setCn] = React.useState<CnLine[]>([{ description: "", qty: 1, price: 0, taxPct: 18 }]);

  React.useEffect(() => {
    let live = true;
    Promise.all([getInvoice(id), onlinePaymentsEnabled(), getInvoiceExtras(id)]).then(([r, o, e]) => {
      if (!live) return;
      if (!r.ok) setError(r.error); else { setError(null); setD(r.data); }
      setOnline(o);
      if (e.ok) setX(e.data);
    }).catch(() => live && setError("Couldn't load the invoice."));
    return () => { live = false; };
  }, [id, tick]);

  if (error && !d) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;

  const i = d.invoice;
  const due = i.totalPaise - i.paidPaise;
  const st = displayStatus(i, todayIST());
  const canPay = i.status !== "void" && i.status !== "paid" && due > 0;
  const brand = x?.seller.brandColor ?? undefined;
  const refresh = () => setTick((t) => t + 1);
  const done = (r: { ok: boolean; error?: string }, ok: string) => {
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong"); return false; }
    setError(null); setInfo(ok); refresh(); return true;
  };

  const record = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    done(await recordPayment({ invoiceId: i.id, amount: Number(f.get("amount")), method: String(f.get("method")) as "cash", note: String(f.get("note") ?? "") || undefined }), "Payment recorded.");
  };
  const refund = async (e: React.FormEvent<HTMLFormElement>, paymentId: string) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setInfo(null);
    const r = await refundPayment({ paymentId, amount: Number(f.get("amount")), reason: String(f.get("reason") ?? "") });
    if (done(r, r.ok && r.data.status === "pending" ? (r.data.approvers > 0 ? "That refund is large, so it needs a manager's approval. We've asked them." : "That refund is large, so it needs approval. There's no other manager, so you can approve it from the Payments page.") : "Refund recorded.")) setRefunding(null);
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
        if (!c.ok) setError(c.error); else { setInfo("Payment received. Thank you!"); refresh(); }
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  };
  const doVoid = async () => {
    if (!window.confirm("Void this invoice? This can't be undone.")) return;
    const r = await voidInvoice(i.id);
    if (!r.ok) setError(r.error); else refresh();
  };
  const email = async () => {
    setBusy(true); setInfo(null);
    done(await sendInvoiceEmail(i.id), `Invoice emailed to ${d.customer.email}.`);
  };
  const payLink = async () => {
    setBusy(true); setInfo(null);
    const r = await sendPayLink(i.id);
    if (done(r, "")) setInfo(r.ok ? `Payment link ready and sent to ${d.customer.name}${r.data.emailed ? " (by email too)" : ""}.` : null);
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setInfo("Link copied."); } catch { setError("Couldn't copy. Select the link and copy it."); }
  };
  const tds = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const mode = String(f.get("mode"));
    setBusy(true); setInfo(null);
    if (done(await recordTds({ invoiceId: i.id, ...(mode === "percent" ? { percent: Number(f.get("percent")) } : { amount: Number(f.get("amount")) }), note: String(f.get("note") ?? "") || undefined }), "TDS recorded.")) setPanel(null);
  };
  const creditNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setInfo(null);
    const r = await createCreditNote({ invoiceId: i.id, lines: cn.map((l) => ({ ...l })), reason: String(f.get("reason")) });
    const msg = r.ok ? `Credit note ${r.data.number} created.${r.data.refundDuePaise > 0 ? ` ${rupees(r.data.refundDuePaise)} was already paid, so refund it from the payment above.` : ""}` : "";
    if (done(r, msg)) { setPanel(null); setCn([{ description: "", qty: 1, price: 0, taxPct: 18 }]); }
  };
  const einvoice = async () => { setBusy(true); setInfo(null); done(await generateEInvoice(i.id), "e-Invoice generated."); };
  const cancelIrn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!window.confirm("Cancel this e-invoice (IRN)? This is final.")) return;
    setBusy(true); setInfo(null);
    done(await cancelEInvoice({ invoiceId: i.id, reason: String(f.get("reason")) as "1", remark: String(f.get("remark")) }), "e-Invoice cancelled.");
  };

  const cnTotals = gst(cn.map((l) => ({ description: l.description, qty: l.qty, unitPaise: Math.round(l.price * 100), taxPct: l.taxPct })), i.igstPaise > 0, 0);
  const ev = x?.einvoice;

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
      {info && <p role="status" className="no-print rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      <Card className="space-y-6 p-6 sm:p-8" style={brand ? { borderTop: `4px solid ${brand}` } : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tax Invoice</h1>
            <p className="text-muted">{i.number}</p>
          </div>
          <div className="text-right text-sm">
            {x?.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.logoUrl} alt="" className="mb-2 ml-auto max-h-12 w-auto" />}
            <p className="font-semibold">{x?.seller.name ?? d.seller.name}</p>
            {(x?.seller.gstin ?? d.seller.gstin) && <p className="text-muted">GSTIN {x?.seller.gstin ?? d.seller.gstin}</p>}
            {x?.seller.address && <p className="max-w-[260px] text-muted">{x.seller.address}{x.seller.pincode ? ` ${x.seller.pincode}` : ""}</p>}
            {(x?.seller.phone || x?.seller.email) && <p className="text-muted">{[x.seller.phone, x.seller.email].filter(Boolean).join(" · ")}</p>}
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
            <tbody>{d.items.map((it) => (
              <tr key={it.id} className="border-t"><td className="py-2">{it.description}</td><td>{it.hsnSac}</td><td className="text-right">{it.qty}</td><td className="text-right">{rupees(it.unitPaise)}</td><td className="text-right">{it.taxPct}%</td><td className="text-right">{rupees(it.qty * it.unitPaise)}</td></tr>
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

        {ev?.status === "generated" && ev.irn && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border p-3 text-xs">
            {ev.qrDataUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={ev.qrDataUrl} alt="e-Invoice QR code" width={96} height={96} />}
            <div className="min-w-0 space-y-0.5"><p className="font-medium">e-Invoice (IRN)</p><p className="break-all font-mono">{ev.irn}</p><p className="text-muted">Ack No. {ev.ackNo}{ev.ackDate ? ` · ${new Date(ev.ackDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p></div>
          </div>
        )}
        {d.payments.length > 0 && (
          <div className="text-sm"><p className="mb-1 font-medium">Payments and settlements</p>
            <ul className="space-y-2">{d.payments.map((p) => {
              const left = p.amountPaise - p.refundedPaise;
              const cash = p.method !== "tds" && p.method !== "credit_note";
              return (
                <li key={p.id} className="text-muted">
                  {new Date(p.at).toLocaleDateString("en-IN")} · {rupees(p.amountPaise)} · {METHOD[p.method] ?? p.method}{p.note ? ` · ${p.note}` : ""}
                  {p.refundedPaise > 0 && <span className="text-red-600"> · refunded {rupees(p.refundedPaise)}</span>}
                  {finance && cash && left > 0 && <button onClick={() => setRefunding(refunding === p.id ? null : p.id)} className="no-print ml-2 text-accent hover:underline">Refund</button>}
                  {refunding === p.id && (
                    <form onSubmit={(e) => refund(e, p.id)} className="no-print mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-[120px_1fr_auto]">
                      <input name="amount" type="number" min="0.01" step="0.01" max={left / 100} defaultValue={left / 100} required aria-label="Refund amount in rupees" className={field + " mt-0"} />
                      <input name="reason" maxLength={255} placeholder="Reason (optional)" aria-label="Reason" className={field + " mt-0"} />
                      <Button type="submit" size="sm" disabled={busy}>{busy ? "Refunding…" : "Refund"}</Button>
                      <p className="text-xs sm:col-span-3">{p.method === "razorpay" ? "This is sent back to the customer's card/UPI through Razorpay." : "Hand the money back yourself; this records it."} Large refunds need a manager&apos;s approval.</p>
                    </form>
                  )}
                </li>
              );
            })}</ul>
          </div>
        )}
        {x && x.creditNotes.length > 0 && (
          <div className="text-sm"><p className="mb-1 font-medium">Credit notes</p>
            <ul className="space-y-1">{x.creditNotes.map((c) => (
              <li key={c.id} className="text-muted"><Link href={`/credit-notes/${c.id}`} className="font-medium text-accent hover:underline">{c.number}</Link> · {c.issueDate} · {rupees(c.totalPaise)}{c.reason ? ` · ${c.reason}` : ""}</li>
            ))}</ul>
          </div>
        )}
        {x?.seller.footer && <p className="border-t pt-3 text-xs text-muted">{x.seller.footer}</p>}
      </Card>

      {canPay && (
        <Card className="no-print space-y-4">
          <h2 className="font-medium">Pay this invoice</h2>
          {online
            ? <Button onClick={payOnline} disabled={busy} className="w-full sm:w-auto">{busy ? "Opening…" : `Pay ${rupees(due)} online`}</Button>
            : <p className="text-sm text-muted">Online payment isn&apos;t enabled yet. Please pay at reception.</p>}
          {finance && online && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button variant="secondary" size="sm" onClick={payLink} disabled={busy}><Link2 size={16} />{x?.payLinkUrl ? "Send a fresh payment link" : "Send payment link"}</Button>
              {x?.payLinkUrl && <><code className="max-w-[260px] truncate rounded-lg bg-surface-2 px-2 py-1 text-xs">{x.payLinkUrl}</code><Button variant="ghost" size="sm" onClick={() => copy(x.payLinkUrl!)}><Copy size={14} />Copy</Button></>}
              <p className="w-full text-xs text-muted">Sends the customer a UPI / card / net-banking link for {rupees(due)}: in the app, by email, and by WhatsApp or SMS if they opted in. Paying it marks the invoice paid automatically.</p>
            </div>
          )}
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

      {finance && i.status !== "void" && (
        <Card className="no-print space-y-3">
          <h2 className="font-medium">Adjustments and compliance</h2>
          <div className="flex flex-wrap gap-2">
            {canPay && <Button variant={panel === "tds" ? "primary" : "secondary"} size="sm" onClick={() => setPanel(panel === "tds" ? null : "tds")}>Customer deducted TDS</Button>}
            <Button variant={panel === "credit" ? "primary" : "secondary"} size="sm" onClick={() => setPanel(panel === "credit" ? null : "credit")}>Issue credit note</Button>
            {ev && <Button variant={panel === "einv" ? "primary" : "secondary"} size="sm" onClick={() => setPanel(panel === "einv" ? null : "einv")}>e-Invoice (IRN){ev.status === "generated" ? " ✓" : ""}</Button>}
          </div>

          {panel === "tds" && (
            <form onSubmit={tds} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-4">
              <p className="text-sm text-muted sm:col-span-4">Some customers pay less because they deduct TDS (and deposit it with the government). Record it so the invoice shows as settled. It isn&apos;t counted as revenue received. TDS is worked out on {rupees(x?.taxableValuePaise ?? i.subtotalPaise)} (the value before GST).</p>
              <label className="text-sm font-medium">Work it out as<select name="mode" defaultValue="percent" className={field} onChange={(e) => { const f = e.currentTarget.form!; (f.elements.namedItem("percent") as HTMLInputElement).disabled = e.currentTarget.value !== "percent"; (f.elements.namedItem("amount") as HTMLInputElement).disabled = e.currentTarget.value !== "amount"; }}><option value="percent">A percentage</option><option value="amount">An exact amount</option></select></label>
              <label className="text-sm font-medium">TDS %<select name="percent" defaultValue="10" className={field}>{[1, 2, 5, 10].map((p) => <option key={p} value={p}>{p}%</option>)}</select></label>
              <label className="text-sm font-medium">Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" max={due / 100} disabled className={field} /></label>
              <label className="text-sm font-medium">Certificate / note<input name="note" maxLength={100} className={field} placeholder="Optional" /></label>
              <Button type="submit" size="sm" disabled={busy} className="sm:col-span-4 sm:w-fit">Record TDS</Button>
            </form>
          )}

          {panel === "credit" && (
            <form onSubmit={creditNote} className="space-y-3 rounded-xl border p-3">
              <p className="text-sm text-muted">A credit note reduces what the customer owes. It follows this invoice&apos;s tax type ({i.igstPaise > 0 ? "IGST" : "CGST + SGST"}) and is numbered CN-year-number. Anything already paid is handed back as a refund.</p>
              {cn.map((l, n) => (
                <div key={n} className="grid gap-2 sm:grid-cols-[1fr_70px_110px_90px_auto]">
                  <input value={l.description} onChange={(e) => setCn(cn.map((z, k) => (k === n ? { ...z, description: e.target.value } : z)))} required maxLength={255} placeholder="What is being credited" aria-label="Description" className={field + " mt-0"} />
                  <input type="number" min="1" value={l.qty} onChange={(e) => setCn(cn.map((z, k) => (k === n ? { ...z, qty: Number(e.target.value) } : z)))} aria-label="Quantity" className={field + " mt-0"} />
                  <input type="number" min="0" step="0.01" value={l.price || ""} onChange={(e) => setCn(cn.map((z, k) => (k === n ? { ...z, price: Number(e.target.value) } : z)))} required placeholder="₹ each" aria-label="Unit price in rupees" className={field + " mt-0"} />
                  <select value={l.taxPct} onChange={(e) => setCn(cn.map((z, k) => (k === n ? { ...z, taxPct: Number(e.target.value) as 18 } : z)))} aria-label="GST rate" className={field + " mt-0"}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}% GST</option>)}</select>
                  {cn.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setCn(cn.filter((_, k) => k !== n))}>Remove</Button>}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCn([...cn, { description: "", qty: 1, price: 0, taxPct: 18 }])}>Add line</Button>
                <p className="text-sm">Credit total <b>{rupees(cnTotals.total)}</b> <span className="text-muted">(incl. {rupees(cnTotals.cgst + cnTotals.sgst + cnTotals.igst)} GST)</span></p>
              </div>
              <label className="block text-sm font-medium">Reason<input name="reason" required minLength={3} maxLength={255} className={field} placeholder="e.g. Desk not available for 5 days" /></label>
              <Button type="submit" size="sm" disabled={busy || cnTotals.total <= 0}>Create credit note</Button>
            </form>
          )}

          {panel === "einv" && ev && (
            <div className="space-y-3 rounded-xl border p-3 text-sm">
              {ev.status === "generated" ? (
                <>
                  <p>This invoice is registered with the government e-invoice portal.</p>
                  {ev.canCancel ? (
                    <form onSubmit={cancelIrn} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <select name="reason" className={field + " mt-0"} aria-label="Reason"><option value="1">Duplicate</option><option value="2">Data entry mistake</option><option value="3">Order cancelled</option><option value="4">Other</option></select>
                      <input name="remark" required minLength={3} maxLength={100} placeholder="Remark" aria-label="Remark" className={field + " mt-0"} />
                      <Button type="submit" variant="secondary" size="sm" disabled={busy}>Cancel IRN</Button>
                      <p className="text-xs text-muted sm:col-span-3">An IRN can be cancelled only within 24 hours. After that, issue a credit note.</p>
                    </form>
                  ) : <p className="text-muted">The 24-hour window to cancel is over. Use a credit note for changes.</p>}
                </>
              ) : ev.status === "cancelled" ? <p className="text-muted">The IRN for this invoice was cancelled.</p> : (
                <>
                  <p className="text-muted">e-Invoices apply to business-to-business invoices (the buyer has a GSTIN). Generating one sends the invoice to the government portal and returns an IRN and QR code, which are then printed on the invoice.</p>
                  {ev.needs && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">{ev.needs}</p>}
                  {ev.error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-400">Last attempt: {ev.error}</p>}
                  <Button size="sm" onClick={einvoice} disabled={busy || !!ev.needs}>Generate e-Invoice</Button>
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
