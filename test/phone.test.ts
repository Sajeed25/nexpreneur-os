import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone, oneLine } from "@/lib/phone";

describe("normalizePhone", () => {
  it("adds the India code to a 10-digit mobile", () => expect(normalizePhone("98480 12345")).toBe("919848012345"));
  it("accepts +91, 91 and 0 prefixes", () => {
    expect(normalizePhone("+91 98480-12345")).toBe("919848012345");
    expect(normalizePhone("919848012345")).toBe("919848012345");
    expect(normalizePhone("09848012345")).toBe("919848012345");
    expect(normalizePhone("0091 9848012345")).toBe("919848012345");
  });
  it("accepts other countries with an explicit +", () => expect(normalizePhone("+1 (415) 555-0132")).toBe("14155550132"));
  it("rejects landlines and rubbish", () => {
    expect(normalizePhone("040 2345 6789")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("915848012345")).toBeNull(); // Indian mobiles start with 6, 7, 8 or 9
    expect(normalizePhone("7848012345")).toBe("917848012345");
  });
});

describe("maskPhone / oneLine", () => {
  it("hides the middle", () => expect(maskPhone("919848012345")).toBe("91••••••2345"));
  it("returns empty for short input", () => expect(maskPhone("123")).toBe(""));
  it("flattens whitespace for WhatsApp templates", () => expect(oneLine("a\n\n b\t\t c   d")).toBe("a b c d"));
});
