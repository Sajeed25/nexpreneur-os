import { describe, expect, it } from "vitest";
import { csvCell, csvRow, rs } from "@/lib/csv";
import { gstRegisterCsv, paymentsCsv, saleEntries, tallyXml, TALLY_DEFAULTS, xml, zohoCsv, type CreditNoteRow, type PaymentLine, type SaleInvoice } from "@/lib/exports-math";
import { gst } from "@/lib/billing";

const mk = (number: string, items: SaleInvoice["items"], o: Partial<SaleInvoice> & { inter?: boolean; discount?: number } = {}): SaleInvoice => {
  const g = gst(items.map((i) => ({ description: i.description, qty: i.qty, unitPaise: i.unitPaise, taxPct: i.taxPct })), !!o.inter, o.discount ?? 0);
  return { number, date: "2026-10-15", dueDate: "2026-10-22", status: "unpaid", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", gstin: "36ZLPLA1234A1Z4", placeOfSupply: "Telangana", subtotalPaise: g.subtotal, discountPaise: g.discount, cgstPaise: g.cgst, sgstPaise: g.sgst, igstPaise: g.igst, totalPaise: g.total, items, ...o };
};
const flexi = [{ description: "Flexi membership", hsnSac: "997212", qty: 1, unitPaise: 399_900, taxPct: 18 }];
const sale = mk("INV-2026-0241", flexi);

describe("csv", () => {
  it("formats rupees plainly", () => { expect(rs(471882)).toBe("4718.82"); expect(rs(100)).toBe("1.00"); expect(rs(-5900)).toBe("-59.00"); });
  it("quotes commas and quotes", () => expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"'));
  it("neutralises spreadsheet formulas", () => { expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)"); expect(csvCell("+91 98480")).toBe("'+91 98480"); expect(csvCell("@cmd")).toBe("'@cmd"); expect(csvCell("-1+2")).toBe("'-1+2"); expect(csvCell(-5)).toBe("-5"); });
  it("leaves negative amounts as numbers", () => { expect(csvCell("-500.00")).toBe("-500.00"); expect(csvCell("-0.5")).toBe("-0.5"); });
  it("builds a row", () => expect(csvRow("a", 1, null, "b,c")).toBe('a,1,,"b,c"'));
});

describe("tally entries", () => {
  it("balances: what the customer owes equals sales plus tax", () => {
    const e = saleEntries(sale, "Zenith", TALLY_DEFAULTS);
    const dr = e.filter((x) => x.debit).reduce((a, x) => a + x.paise, 0), cr = e.filter((x) => !x.debit).reduce((a, x) => a + x.paise, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(sale.totalPaise);
  });
  it("balances with a discount and IGST too", () => {
    const s = mk("INV-2", [{ description: "Desk", hsnSac: "997212", qty: 3, unitPaise: 150_001, taxPct: 18 }, { description: "Coffee", hsnSac: "996331", qty: 7, unitPaise: 9_999, taxPct: 5 }], { inter: true, discount: 12_345 });
    const e = saleEntries(s, "X", TALLY_DEFAULTS);
    expect(e.filter((x) => x.debit).reduce((a, x) => a + x.paise, 0)).toBe(e.filter((x) => !x.debit).reduce((a, x) => a + x.paise, 0));
  });
  it("reverses for a credit note", () => {
    const e = saleEntries(sale, "Zenith", TALLY_DEFAULTS, true);
    expect(e[0].debit).toBe(false);
    expect(e.find((x) => x.ledger === "Sales")!.debit).toBe(true);
  });
});

describe("tally file", () => {
  const cn: CreditNoteRow = { number: "CN-2026-0001", date: "2026-10-18", invoiceNumber: "INV-2026-0241", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", gstin: "36ZLPLA1234A1Z4", subtotalPaise: 50_000, cgstPaise: 4_500, sgstPaise: 4_500, igstPaise: 0, totalPaise: 59_000, reason: "Service credit" };
  const pay: PaymentLine[] = [
    { date: "2026-10-16", invoiceNumber: "INV-2026-0241", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", method: "upi", amountPaise: 100_000, refundedPaise: 20_000, note: "UTR 123" },
    { date: "2026-10-16", invoiceNumber: "INV-2026-0241", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", method: "cash", amountPaise: 50_000, refundedPaise: 0, note: null },
    { date: "2026-10-17", invoiceNumber: "INV-2026-0241", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", method: "credit_note", amountPaise: 59_000, refundedPaise: 0, note: "CN-2026-0001" },
    { date: "2026-10-17", invoiceNumber: "INV-2026-0241", customer: "Aarav Reddy", company: "Zenith Labs Pvt Ltd", method: "tds", amountPaise: 39_990, refundedPaise: 0, note: "TDS 10%" },
  ];
  const x = tallyXml({ company: "Nexpreneur & Co <Hyd>", sales: [sale], creditNotes: [cn], payments: pay });
  it("has a masters import and a vouchers import", () => { expect(x.match(/<ENVELOPE>/g)).toHaveLength(2); expect(x).toContain("<REPORTNAME>All Masters</REPORTNAME>"); expect(x).toContain("<REPORTNAME>Vouchers</REPORTNAME>"); });
  it("escapes the company name", () => expect(x).toContain("Nexpreneur &amp; Co &lt;Hyd&gt;"));
  it("creates the customer with its GSTIN, and the sales and tax ledgers", () => {
    expect(x).toContain('<LEDGER NAME="Zenith Labs Pvt Ltd" ACTION="Create">');
    expect(x).toContain("<PARTYGSTIN>36ZLPLA1234A1Z4</PARTYGSTIN>");
    for (const l of ["Sales", "Output CGST", "Output SGST", "Output IGST", "Cash", "Bank Account", "TDS Receivable"]) expect(x).toContain(`<LEDGER NAME="${l}"`);
  });
  it("writes the sale with Tally's sign convention (debit negative, credit positive)", () => {
    expect(x).toContain("<VOUCHERNUMBER>INV-2026-0241</VOUCHERNUMBER>");
    expect(x).toContain("<DATE>20261015</DATE>");
    expect(x).toContain("<LEDGERNAME>Zenith Labs Pvt Ltd</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-4718.82</AMOUNT>");
    expect(x).toContain("<LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>3999.00</AMOUNT>");
    expect(x).toContain("<LEDGERNAME>Output CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>359.91</AMOUNT>");
    expect(x).not.toContain("Output IGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>0.00"); // zero lines are left out
  });
  it("records receipts net of refunds, into the right account, and skips credit-note settlements", () => {
    expect(x).toContain("<VOUCHERNUMBER>RCPT-INV-2026-0241-1</VOUCHERNUMBER>");
    expect(x).toContain("<LEDGERNAME>Bank Account</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-800.00</AMOUNT>"); // 1000 - 200 refunded
    expect(x).toContain("<LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-500.00</AMOUNT>");
    expect(x).toContain("<LEDGERNAME>TDS Receivable</LEDGERNAME>");
    expect(x.match(/VCHTYPE="Receipt"/g)).toHaveLength(3); // credit-note settlement is not a receipt
  });
  it("writes the credit note", () => { expect(x).toContain('VCHTYPE="Credit Note"'); expect(x).toContain("<VOUCHERNUMBER>CN-2026-0001</VOUCHERNUMBER>"); });
  it("strips characters XML can't hold", () => expect(xml("a\u0001b&c")).toBe("ab&amp;c"));
});

describe("zoho csv", () => {
  const csv = zohoCsv([sale, mk("INV-2", [{ description: "Locker, monthly", hsnSac: "997212", qty: 2, unitPaise: 30_000, taxPct: 12 }, { description: "Coffee", hsnSac: "996331", qty: 1, unitPaise: 9_999, taxPct: 5 }], { gstin: null, company: null, status: "paid", discount: 5_000 })]);
  const lines = csv.trim().split("\r\n");
  it("has a header and one row per invoice line", () => { expect(lines[0]).toContain("Invoice Number"); expect(lines).toHaveLength(4); });
  it("tags business and consumer customers and the state", () => { expect(lines[1]).toContain("business_gst"); expect(lines[1]).toContain("Telangana"); expect(lines[2]).toContain("consumer"); });
  it("puts the discount once, on the first line", () => { expect(lines[2]).toContain(",50.00,"); expect(lines[3]).toContain(",0.00,"); });
  it("quotes a description with a comma", () => expect(lines[2]).toContain('"Locker, monthly"'));
  it("shows IGST rates for interstate invoices", () => expect(zohoCsv([mk("I3", flexi, { inter: true })])).toContain("IGST18"));
});

describe("gst register", () => {
  const two = mk("INV-3", [{ description: "Desk", hsnSac: "997212", qty: 1, unitPaise: 100_000, taxPct: 18 }, { description: "Locker", hsnSac: "997212", qty: 1, unitPaise: 20_000, taxPct: 12 }, { description: "Desk 2", hsnSac: "997212", qty: 1, unitPaise: 50_000, taxPct: 18 }]);
  const csv = gstRegisterCsv([two, { ...sale, status: "void" }], []);
  const lines = csv.trim().split("\r\n");
  it("groups an invoice's lines by rate", () => { expect(lines).toHaveLength(3); expect(lines[1]).toContain(",12,"); expect(lines[2]).toContain(",18,"); });
  it("adds the lines at one rate together", () => expect(lines[2]).toContain("1500.00,135.00,135.00,0.00,1770.00"));
  it("leaves out void invoices", () => expect(csv).not.toContain("INV-2026-0241"));
  it("lists credit notes as negatives", () => {
    const c = gstRegisterCsv([], [{ number: "CN-1", date: "2026-10-18", invoiceNumber: "X", customer: "A", company: null, gstin: null, subtotalPaise: 50_000, cgstPaise: 4_500, sgstPaise: 4_500, igstPaise: 0, totalPaise: 59_000, reason: null }]);
    expect(c).toContain("Credit Note,CN-1,2026-10-18,A,,B2C");
    expect(c).toContain("-500.00,-45.00,-45.00,0.00,-590.00");
  });
  it("marks buyers with a GSTIN as B2B", () => expect(lines[1]).toContain("B2B"));
});

describe("payments csv", () => {
  it("shows net after refunds", () => expect(paymentsCsv([{ date: "2026-10-16", invoiceNumber: "I1", customer: "A", company: null, method: "upi", amountPaise: 100_000, refundedPaise: 20_000, note: "=HYPERLINK(1)" }]).trim().split("\r\n")[1]).toBe("2026-10-16,I1,A,upi,1000.00,200.00,800.00,'=HYPERLINK(1)"));
});
