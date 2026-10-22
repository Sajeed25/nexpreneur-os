// Accounting exports built from plain data: Tally XML, Zoho Books CSV, a GST sales register and a payments list.
// Pure functions (no database), so they can be tested with fixed input. src/lib/exports.ts loads the data.
import { csvRow, rs } from "@/lib/csv";
import { allocateLines } from "@/lib/einvoice";
import { STATE_CODES, stateCodeOf } from "@/lib/gst";

export type SaleInvoice = {
  number: string; date: string; dueDate: string; status: string; customer: string; company: string | null; gstin: string | null; placeOfSupply: string;
  subtotalPaise: number; discountPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
  items: { description: string; hsnSac: string; qty: number; unitPaise: number; taxPct: number }[];
};
export type CreditNoteRow = { number: string; date: string; invoiceNumber: string; customer: string; company: string | null; gstin: string | null; subtotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; reason: string | null };
export type PaymentLine = { date: string; invoiceNumber: string; customer: string; company: string | null; method: string; amountPaise: number; refundedPaise: number; note: string | null };

const party = (x: { customer: string; company: string | null }) => x.company || x.customer;
const interstate = (i: { igstPaise: number }) => i.igstPaise > 0;

// ---------------------------------------------------------------- Tally

export type TallyLedgers = { sales: string; cgst: string; sgst: string; igst: string; cash: string; bank: string; tds: string };
export const TALLY_DEFAULTS: TallyLedgers = { sales: "Sales", cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST", cash: "Cash", bank: "Bank Account", tds: "TDS Receivable" };

export const xml = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const ymd = (d: string) => d.replace(/-/g, "");
const amt = (paise: number) => rs(paise);

type Entry = { ledger: string; paise: number; debit: boolean };
function voucher(type: string, o: { date: string; number: string; party: string; narration: string; entries: Entry[] }) {
  // Tally's sign convention: a debit entry is "deemed positive" with a negative amount; a credit has a positive amount.
  const lines = o.entries.filter((e) => e.paise !== 0).map((e) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${e.debit ? "-" : ""}${amt(e.paise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("");
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${ymd(o.date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(o.number)}</VOUCHERNUMBER><REFERENCE>${xml(o.number)}</REFERENCE><PARTYLEDGERNAME>${xml(o.party)}</PARTYLEDGERNAME><NARRATION>${xml(o.narration)}</NARRATION>${lines}</VOUCHER></TALLYMESSAGE>`;
}

/** Entries for a sale: customer owes the total; sales and each tax are credited. They always balance because total = taxable + tax. */
export function saleEntries(i: { subtotalPaise: number; discountPaise?: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }, who: string, L: TallyLedgers, credit = false): Entry[] {
  const net = i.subtotalPaise - (i.discountPaise ?? 0);
  return [
    { ledger: who, paise: i.totalPaise, debit: !credit },
    { ledger: L.sales, paise: net, debit: credit }, { ledger: L.cgst, paise: i.cgstPaise, debit: credit },
    { ledger: L.sgst, paise: i.sgstPaise, debit: credit }, { ledger: L.igst, paise: i.igstPaise, debit: credit },
  ];
}

const master = (name: string, parent: string, gstin?: string | null) =>
  `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(name)}" ACTION="Create"><NAME.LIST><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>${xml(parent)}</PARENT>${gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : ""}</LEDGER></TALLYMESSAGE>`;

/**
 * Tally Prime import file: ledger masters first (customers, sales, tax, cash/bank), then Sales, Receipt and Credit Note vouchers.
 * Import with Gateway of Tally > Import > Data. Ledgers that already exist are left alone.
 */
export function tallyXml(o: { company: string; sales: SaleInvoice[]; creditNotes: CreditNoteRow[]; payments: PaymentLine[]; ledgers?: Partial<TallyLedgers> }): string {
  const L = { ...TALLY_DEFAULTS, ...o.ledgers };
  const masters = new Map<string, string>();
  const gstinOf = new Map<string, string | null>();
  for (const s of [...o.sales, ...o.creditNotes]) { const w = party(s); masters.set(w, "Sundry Debtors"); if (s.gstin) gstinOf.set(w, s.gstin); }
  for (const p of o.payments) masters.set(party(p), "Sundry Debtors");
  const fixed: [string, string][] = [[L.sales, "Sales Accounts"], [L.cgst, "Duties & Taxes"], [L.sgst, "Duties & Taxes"], [L.igst, "Duties & Taxes"], [L.cash, "Cash-in-Hand"], [L.bank, "Bank Accounts"], [L.tds, "Current Assets"]];
  const ledgers = [...[...masters].map(([n, p]) => master(n, p, gstinOf.get(n))), ...fixed.map(([n, p]) => master(n, p))];

  const vouchers: string[] = [];
  for (const s of o.sales) vouchers.push(voucher("Sales", { date: s.date, number: s.number, party: party(s), narration: s.items.map((x) => x.description).join("; ").slice(0, 200), entries: saleEntries(s, party(s), L) }));
  for (const c of o.creditNotes) vouchers.push(voucher("Credit Note", { date: c.date, number: c.number, party: party(c), narration: `Against ${c.invoiceNumber}${c.reason ? `: ${c.reason}` : ""}`.slice(0, 200), entries: saleEntries(c, party(c), L, true) }));
  o.payments.forEach((p, i) => {
    const net = p.amountPaise - p.refundedPaise; // money that actually stayed with us
    if (net <= 0 || p.method === "credit_note") return; // a credit note is recorded by its own voucher
    const into = p.method === "cash" ? L.cash : p.method === "tds" ? L.tds : L.bank;
    vouchers.push(voucher("Receipt", { date: p.date, number: `RCPT-${p.invoiceNumber}-${i + 1}`, party: party(p), narration: `Payment for ${p.invoiceNumber} (${p.method})${p.note ? `: ${p.note}` : ""}`.slice(0, 200), entries: [{ ledger: into, paise: net, debit: true }, { ledger: party(p), paise: net, debit: false }] }));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(o.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${ledgers.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n` +
    `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(o.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchers.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
}

// ---------------------------------------------------------------- Zoho Books

/** One row per invoice line, in the shape Zoho Books' "Import invoices" understands. Map any differing column when you import. */
export function zohoCsv(sales: SaleInvoice[]): string {
  const head = ["Invoice Date", "Invoice Number", "Invoice Status", "Customer Name", "GST Identification Number (GSTIN)", "GST Treatment", "Place of Supply", "Due Date", "Item Name", "SAC", "Quantity", "Item Price", "Item Tax", "Item Tax %", "Discount", "Currency Code"];
  const rows: string[] = [csvRow(...head)];
  for (const s of sales) {
    const state = STATE_CODES[stateCodeOf(s.gstin) ?? ""] ?? s.placeOfSupply;
    s.items.forEach((it, idx) => rows.push(csvRow(
      s.date, s.number, s.status === "paid" ? "Paid" : s.status === "partial" ? "Partially Paid" : "Sent", party(s), s.gstin ?? "", s.gstin ? "business_gst" : "consumer", state, s.dueDate,
      it.description, it.hsnSac, it.qty, rs(it.unitPaise), `${interstate(s) ? "IGST" : "GST"}${it.taxPct}`, it.taxPct, idx === 0 ? rs(s.discountPaise) : "0.00", "INR",
    )));
  }
  return rows.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- GST sales register

/** A rate-wise sales register for filing GSTR-1: B2B (buyer has a GSTIN) and B2C, one row per invoice and tax rate; credit notes as negative rows. */
export function gstRegisterCsv(sales: SaleInvoice[], creditNotes: CreditNoteRow[]): string {
  const rows: string[] = [csvRow("Document", "Number", "Date", "Customer", "GSTIN", "Type", "Place of Supply", "Rate %", "Taxable value", "CGST", "SGST", "IGST", "Total")];
  for (const s of sales) {
    if (s.status === "void") continue;
    const lines = allocateLines(s.items, s.discountPaise, interstate(s));
    const by = new Map<number, { ass: number; cgst: number; sgst: number; igst: number }>();
    s.items.forEach((it, i) => { const b = by.get(it.taxPct) ?? { ass: 0, cgst: 0, sgst: 0, igst: 0 }; b.ass += lines[i].ass; b.cgst += lines[i].cgst; b.sgst += lines[i].sgst; b.igst += lines[i].igst; by.set(it.taxPct, b); });
    const state = STATE_CODES[stateCodeOf(s.gstin) ?? ""] ?? s.placeOfSupply;
    for (const [rate, b] of [...by].sort((a, c) => a[0] - c[0])) rows.push(csvRow("Invoice", s.number, s.date, party(s), s.gstin ?? "", s.gstin ? "B2B" : "B2C", state, rate, rs(b.ass), rs(b.cgst), rs(b.sgst), rs(b.igst), rs(b.ass + b.cgst + b.sgst + b.igst)));
  }
  for (const c of creditNotes) rows.push(csvRow("Credit Note", c.number, c.date, party(c), c.gstin ?? "", c.gstin ? "B2B" : "B2C", "", "", rs(-c.subtotalPaise), rs(-c.cgstPaise), rs(-c.sgstPaise), rs(-c.igstPaise), rs(-c.totalPaise)));
  return rows.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- Payments

export function paymentsCsv(payments: PaymentLine[]): string {
  const rows = [csvRow("Date", "Invoice", "Customer", "Method", "Amount", "Refunded", "Net", "Reference")];
  for (const p of payments) rows.push(csvRow(p.date, p.invoiceNumber, party(p), p.method, rs(p.amountPaise), rs(p.refundedPaise), rs(p.amountPaise - p.refundedPaise), p.note ?? ""));
  return rows.join("\r\n") + "\r\n";
}
