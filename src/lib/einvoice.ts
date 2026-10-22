// E-invoicing (GST IRN). Builds the NIC e-invoice schema v1.1 payload from one of our invoices and understands the
// reply. Pure functions: no database, no network. src/lib/einvoice-server.ts does the sending.
import { isGstin, pinFrom, stateCodeOf } from "@/lib/gst";

export type EInvSeller = { name: string; gstin: string; address: string; pincode: string; stateCode: string; phone?: string; email?: string };
export type EInvBuyer = { name: string; gstin: string; address: string; pincode: string | null };
export type EInvInput = {
  invoice: { number: string; issueDate: string; discountPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
  items: { description: string; hsnSac: string; qty: number; unitPaise: number; taxPct: number }[];
  seller: EInvSeller; buyer: EInvBuyer;
};

const r2 = (paise: number) => Math.round(paise) / 100; // rupees, 2 decimals
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export type EInvResult = { ok: true; payload: Record<string, unknown>; totalPaise: number } | { ok: false; error: string };

/** What the IRP calls "assessable value" per line: the line's value after its share of the discount, and the GST on it. */
export function allocateLines(items: EInvInput["items"], discountPaise: number, interstate: boolean) {
  const gross = items.map((i) => i.qty * i.unitPaise);
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const discount = Math.max(0, Math.min(Math.round(discountPaise), subtotal));
  let left = discount;
  return items.map((it, idx) => {
    const share = idx === items.length - 1 ? left : Math.round((discount * gross[idx]) / (subtotal || 1));
    left -= share;
    const ass = gross[idx] - share;
    const tax = Math.round((ass * it.taxPct) / 100);
    const cgst = interstate ? 0 : Math.floor(tax / 2);
    return { gross: gross[idx], discount: share, ass, cgst, sgst: interstate ? 0 : tax - cgst, igst: interstate ? tax : 0 };
  });
}

export function buildEInvoice(x: EInvInput): EInvResult {
  const { seller, buyer, invoice } = x;
  if (!isGstin(seller.gstin)) return { ok: false, error: "Add your business GSTIN under Settings > Business profile first." };
  if (!seller.address || !/^[1-9]\d{5}$/.test(seller.pincode)) return { ok: false, error: "Add your business address and 6-digit PIN code under Settings > Business profile." };
  if (!isGstin(buyer.gstin)) return { ok: false, error: "e-Invoices are for GST-registered buyers. Add the buyer's GSTIN (on the company or the invoice) first." };
  const pin = buyer.pincode ?? pinFrom(buyer.address);
  if (!pin) return { ok: false, error: "Add a 6-digit PIN code to the company's billing address." };
  if (!x.items.length) return { ok: false, error: "The invoice has no lines." };
  if (invoice.number.length > 16 || !/^[A-Za-z0-9/-]+$/.test(invoice.number)) return { ok: false, error: "The invoice number isn't valid for e-invoicing (up to 16 letters, digits, / or -)." };

  const buyerState = stateCodeOf(buyer.gstin)!;
  const interstate = invoice.igstPaise > 0;
  if (interstate === (buyerState === seller.stateCode)) {
    return { ok: false, error: `The tax type doesn't match the states (you are in ${seller.stateCode}, the buyer in ${buyerState}). ${interstate ? "This invoice charges IGST but both are in the same state." : "This invoice charges CGST + SGST but the buyer is in another state."} Void it and create it again with the right setting.` };
  }

  const lines = allocateLines(x.items, invoice.discountPaise, interstate);
  const itemList = x.items.map((it, i) => {
    const l = lines[i];
    const tot = l.ass + l.cgst + l.sgst + l.igst;
    return {
      SlNo: String(i + 1), PrdDesc: clip(it.description, 300), IsServc: it.hsnSac.startsWith("99") ? "Y" : "N", HsnCd: it.hsnSac,
      Qty: it.qty, Unit: "OTH", UnitPrice: r2(it.unitPaise), TotAmt: r2(l.gross), Discount: r2(l.discount), AssAmt: r2(l.ass),
      GstRt: it.taxPct, IgstAmt: r2(l.igst), CgstAmt: r2(l.cgst), SgstAmt: r2(l.sgst), TotItemVal: r2(tot),
    };
  });
  const sum = (k: "ass" | "cgst" | "sgst" | "igst") => lines.reduce((a, l) => a + l[k], 0);
  const total = sum("ass") + sum("cgst") + sum("sgst") + sum("igst");
  if (Math.abs(total - invoice.totalPaise) > 100) return { ok: false, error: "The line totals don't add up to the invoice total (more than ₹1 apart). Check the invoice." };

  return {
    ok: true, totalPaise: total,
    payload: {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
      DocDtls: { Typ: "INV", No: invoice.number, Dt: ddmmyyyy(invoice.issueDate) },
      SellerDtls: { Gstin: seller.gstin, LglNm: clip(seller.name, 100), Addr1: clip(seller.address, 100), Loc: clip(seller.address.split(",").slice(-2)[0] || seller.address, 50), Pin: Number(seller.pincode), Stcd: seller.stateCode, ...(seller.phone ? { Ph: seller.phone.replace(/\D/g, "").slice(-12) } : {}), ...(seller.email ? { Em: seller.email } : {}) },
      BuyerDtls: { Gstin: buyer.gstin, LglNm: clip(buyer.name, 100), Pos: buyerState, Addr1: clip(buyer.address || "-", 100), Loc: clip(buyer.address.split(",").slice(-2)[0] || "-", 50), Pin: Number(pin), Stcd: buyerState },
      ItemList: itemList,
      ValDtls: { AssVal: r2(sum("ass")), CgstVal: r2(sum("cgst")), SgstVal: r2(sum("sgst")), IgstVal: r2(sum("igst")), TotInvVal: r2(total) },
    },
  };
}

export type Irn = { irn: string; ackNo: string; ackDate: Date | null; signedQr: string | null };

/** Reads a GSP's reply. Accepts the NIC field names, directly or nested under data / result. */
export function parseEInvoiceResponse(json: unknown): { ok: true; irn: Irn } | { ok: false; error: string } {
  const o = (json ?? {}) as Record<string, unknown>;
  const inner = ((o.data ?? o.Data ?? o.result ?? o.Result ?? o) as Record<string, unknown>) || {};
  const pick = (k: string) => (inner[k] ?? inner[k[0].toLowerCase() + k.slice(1)] ?? inner[k.toLowerCase()]) as unknown;
  const irn = pick("Irn");
  if (typeof irn === "string" && /^[a-f0-9]{64}$/i.test(irn)) {
    const ackDt = pick("AckDt");
    const d = typeof ackDt === "string" ? new Date(ackDt.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(ackDt) ? "" : "+05:30")) : null;
    return { ok: true, irn: { irn: irn.toLowerCase(), ackNo: String(pick("AckNo") ?? ""), ackDate: d && !isNaN(d.getTime()) ? d : null, signedQr: typeof pick("SignedQRCode") === "string" ? (pick("SignedQRCode") as string) : null } };
  }
  const details = (o.ErrorDetails ?? o.errorDetails ?? inner.ErrorDetails) as { ErrorCode?: string; ErrorMessage?: string }[] | undefined;
  const msg = details?.[0]?.ErrorMessage ?? (typeof o.error === "string" ? o.error : (o.error as { message?: string } | undefined)?.message) ?? (typeof o.message === "string" ? o.message : null);
  return { ok: false, error: msg ? clip(String(msg), 280) : "The e-invoice service didn't return an IRN." };
}
