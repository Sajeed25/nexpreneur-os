import { describe, expect, it } from "vitest";
import { addDays, addMonths, couponDiscount, daysBetween, displayStatus, gst, invoiceNumber, statusFor, toPaise } from "@/lib/billing";

const line = (qty: number, unitPaise: number, taxPct = 18) => ({ description: "x", qty, unitPaise, taxPct });

describe("gst", () => {
  it("splits same-state tax into equal CGST and SGST", () => {
    expect(gst([line(1, 399_900)], false)).toEqual({ subtotal: 399_900, discount: 0, cgst: 35_991, sgst: 35_991, igst: 0, total: 471_882 });
  });
  it("charges IGST for another state, same total", () => {
    expect(gst([line(1, 399_900)], true)).toEqual({ subtotal: 399_900, discount: 0, cgst: 0, sgst: 0, igst: 71_982, total: 471_882 });
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

describe("discounts and coupons", () => {
  it("charges GST on the discounted price", () => {
    // 10% off 3,999 = 399.90 off; taxable 3,599.10; GST 647.84 (rounded)
    const g = gst([line(1, 399_900)], false, couponDiscount("percent", 10, 399_900));
    expect(g.discount).toBe(39_990);
    expect(g.cgst + g.sgst).toBe(64_784);
    expect(g.total).toBe(399_900 - 39_990 + 64_784);
  });
  it("shares a discount across lines in proportion and never goes negative", () => {
    const g = gst([line(1, 10_000, 18), line(1, 30_000, 5)], false, 4_000); // 1,000 off line 1, 3,000 off line 2
    expect(g.subtotal).toBe(40_000);
    expect(g.cgst + g.sgst).toBe(Math.round(9_000 * 0.18 + 27_000 * 0.05));
    expect(gst([line(1, 5_000)], false, 999_999).total).toBe(0); // discount can't exceed the subtotal
  });
  it("computes coupon values", () => {
    expect(couponDiscount("percent", 25, 80_000)).toBe(20_000);
    expect(couponDiscount("percent", 150, 80_000)).toBe(80_000);
    expect(couponDiscount("fixed", 50_000, 80_000)).toBe(50_000);
    expect(couponDiscount("fixed", 500_000, 80_000)).toBe(80_000);
    expect(couponDiscount("percent", 10, 0)).toBe(0);
  });
});

describe("invoice status after payments and refunds", () => {
  it("moves between unpaid, partial and paid", () => {
    expect(statusFor(10_000, 0)).toBe("unpaid");
    expect(statusFor(10_000, 4_000)).toBe("partial");
    expect(statusFor(10_000, 10_000)).toBe("paid");
    expect(statusFor(10_000, 12_000)).toBe("paid");
  });
});

describe("renewal dates", () => {
  it("advances by the billing cycle and keeps month ends sensible", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-10-02", 1)).toBe("2026-11-02");
  });
  it("does date arithmetic without timezone drift", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-03", "2026-10-06")).toBe(3);
    expect(daysBetween("2026-10-06", "2026-10-03")).toBe(-3);
  });
});
