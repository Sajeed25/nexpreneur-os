import { describe, expect, it } from "vitest";
import { addMonths, displayStatus, gst, invoiceNumber, toPaise } from "@/lib/billing";

const line = (qty: number, unitPaise: number, taxPct = 18) => ({ description: "x", qty, unitPaise, taxPct });

describe("gst", () => {
  it("splits same-state tax into equal CGST and SGST", () => {
    expect(gst([line(1, 399_900)], false)).toEqual({ subtotal: 399_900, cgst: 35_991, sgst: 35_991, igst: 0, total: 471_882 });
  });
  it("charges IGST for another state, same total", () => {
    expect(gst([line(1, 399_900)], true)).toEqual({ subtotal: 399_900, cgst: 0, sgst: 0, igst: 71_982, total: 471_882 });
  });
  it("never loses a paisa when the tax is odd", () => {
    const g = gst([line(3, 3_333)], false); // tax 1799.82 -> 1800 paise
    expect(g.cgst + g.sgst).toBe(g.total - g.subtotal);
    expect(g.total).toBe(9_999 + 1_800);
  });
  it("handles mixed rates and zero-rated lines", () => {
    const g = gst([line(1, 10_000, 18), line(1, 10_000, 5), line(1, 10_000, 0)], false);
    expect(g.subtotal).toBe(30_000);
    expect(g.cgst + g.sgst).toBe(2_300);
  });
});

describe("dates and numbering", () => {
  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-10-02", 12)).toBe("2027-10-02");
  });
  it("pads invoice numbers", () => expect(invoiceNumber(2026, 7)).toBe("INV-2026-0007"));
  it("converts rupees to paise without float drift", () => {
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});

describe("displayStatus", () => {
  it("flags overdue only while money is owed", () => {
    expect(displayStatus({ status: "unpaid", dueDate: "2026-10-01" }, "2026-10-02")).toBe("overdue");
    expect(displayStatus({ status: "partial", dueDate: "2026-10-01" }, "2026-10-02")).toBe("overdue");
    expect(displayStatus({ status: "paid", dueDate: "2026-10-01" }, "2026-10-02")).toBe("paid");
    expect(displayStatus({ status: "void", dueDate: "2026-10-01" }, "2026-10-02")).toBe("void");
    expect(displayStatus({ status: "unpaid", dueDate: "2026-10-02" }, "2026-10-02")).toBe("unpaid");
  });
});
