import { describe, expect, it } from "vitest";
import { allocateLines, buildEInvoice, parseEInvoiceResponse, type EInvInput } from "@/lib/einvoice";
import { gst } from "@/lib/billing";
import { isGstin, pinFrom, stateCodeOf } from "@/lib/gst";

const seller = { name: "Nexpreneur Spaces Pvt Ltd", gstin: "36AABCN1234F1Z5", address: "Plot 5, Madhapur, Hyderabad", pincode: "500081", stateCode: "36" };
const buyer = { name: "Zenith Labs Pvt Ltd", gstin: "36AABCZ9999K1Z2", address: "Road 36, Jubilee Hills, Hyderabad 500033", pincode: null };

function invoice(items: EInvInput["items"], interstate: boolean, discountPaise = 0): EInvInput {
  const g = gst(items.map((i) => ({ description: i.description, qty: i.qty, unitPaise: i.unitPaise, taxPct: i.taxPct })), interstate, discountPaise);
  return { invoice: { number: "INV-2026-0042", issueDate: "2026-10-15", discountPaise: g.discount, cgstPaise: g.cgst, sgstPaise: g.sgst, igstPaise: g.igst, totalPaise: g.total }, items, seller, buyer };
}
const one = [{ description: "Flexi membership", hsnSac: "997212", qty: 1, unitPaise: 399_900, taxPct: 18 }];

describe("GST identifiers", () => {
  it("validates GSTINs", () => {
    expect(isGstin("36AABCN1234F1Z5")).toBe(true);
    expect(isGstin("36aabcn1234f1z5")).toBe(true);
    expect(isGstin("36AABCN1234F1Y5")).toBe(false);
    expect(isGstin("123")).toBe(false);
    expect(isGstin(null)).toBe(false);
  });
  it("reads the state code", () => expect(stateCodeOf("29AABCN1234F1Z5")).toBe("29"));
  it("finds a PIN code in an address", () => {
    expect(pinFrom("Road 36, Jubilee Hills, Hyderabad 500033")).toBe("500033");
    expect(pinFrom("Flat 1234567, Hyd 500081")).toBe("500081");
    expect(pinFrom("no pin here")).toBeNull();
  });
});

describe("e-invoice payload", () => {
  it("builds an intra-state B2B invoice with CGST + SGST", () => {
    const r = buildEInvoice(invoice(one, false));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.payload as { DocDtls: { No: string; Dt: string }; BuyerDtls: { Pos: string; Pin: number }; ValDtls: Record<string, number>; ItemList: Record<string, number | string>[] };
    expect(p.DocDtls).toEqual({ Typ: "INV", No: "INV-2026-0042", Dt: "15/10/2026" });
    expect(p.BuyerDtls.Pos).toBe("36");
    expect(p.BuyerDtls.Pin).toBe(500033);
    expect(p.ValDtls).toEqual({ AssVal: 3999, CgstVal: 359.91, SgstVal: 359.91, IgstVal: 0, TotInvVal: 4718.82 });
    expect(p.ItemList[0]).toMatchObject({ SlNo: "1", IsServc: "Y", HsnCd: "997212", Qty: 1, UnitPrice: 3999, GstRt: 18, TotItemVal: 4718.82 });
  });
  it("uses IGST for a buyer in another state", () => {
    const x = invoice(one, true);
    x.buyer = { ...buyer, gstin: "29AABCZ9999K1Z2" };
    const r = buildEInvoice(x);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.payload as { ValDtls: { IgstVal: number; CgstVal: number } }).ValDtls).toMatchObject({ IgstVal: 719.82, CgstVal: 0 });
  });
  it("rejects a tax type that doesn't match the buyer's state", () => {
    const x = invoice(one, true); // IGST charged, but the buyer is in Telangana like the seller
    const r = buildEInvoice(x);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tax type/);
  });
  it("shares a discount across lines and still adds up", () => {
    const items = [
      { description: "Desk", hsnSac: "997212", qty: 2, unitPaise: 150_001, taxPct: 18 },
      { description: "Locker", hsnSac: "997212", qty: 1, unitPaise: 30_000, taxPct: 12 },
      { description: "Coffee", hsnSac: "996331", qty: 3, unitPaise: 9_999, taxPct: 5 },
    ];
    const x = invoice(items, false, 55_555);
    const lines = allocateLines(items, 55_555, false);
    expect(lines.reduce((a, l) => a + l.discount, 0)).toBe(55_555);
    const r = buildEInvoice(x);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.abs(r.totalPaise - x.invoice.totalPaise)).toBeLessThanOrEqual(100);
  });
  it("asks for the missing details in plain words", () => {
    const base = invoice(one, false);
    expect(buildEInvoice({ ...base, seller: { ...seller, gstin: "" } })).toMatchObject({ ok: false, error: expect.stringMatching(/business GSTIN/) });
    expect(buildEInvoice({ ...base, seller: { ...seller, pincode: "" } })).toMatchObject({ ok: false, error: expect.stringMatching(/PIN code/) });
    expect(buildEInvoice({ ...base, buyer: { ...buyer, gstin: "" } })).toMatchObject({ ok: false, error: expect.stringMatching(/GSTIN/) });
    expect(buildEInvoice({ ...base, buyer: { ...buyer, address: "Hyderabad" } })).toMatchObject({ ok: false, error: expect.stringMatching(/PIN code/) });
  });
});

describe("e-invoice response", () => {
  const irn = "a".repeat(64);
  it("reads NIC field names", () => {
    const r = parseEInvoiceResponse({ Irn: irn, AckNo: 112010000123456, AckDt: "2026-10-15 11:30:00", SignedQRCode: "eyJ.signed" });
    expect(r).toMatchObject({ ok: true, irn: { irn, ackNo: "112010000123456", signedQr: "eyJ.signed" } });
    if (r.ok) expect(r.irn.ackDate?.toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });
  it("reads a nested reply", () => expect(parseEInvoiceResponse({ data: { irn, ackNo: "9" } })).toMatchObject({ ok: true, irn: { irn, ackNo: "9" } }));
  it("surfaces the service's error", () => {
    expect(parseEInvoiceResponse({ ErrorDetails: [{ ErrorCode: "2150", ErrorMessage: "Duplicate IRN" }] })).toEqual({ ok: false, error: "Duplicate IRN" });
    expect(parseEInvoiceResponse({ error: "bad token" })).toEqual({ ok: false, error: "bad token" });
    expect(parseEInvoiceResponse(null)).toMatchObject({ ok: false });
  });
});
