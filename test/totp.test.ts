import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecovery, hotp, newRecoveryCodes, newSecret, normalizeRecovery, otpauthUri, totpAt, verifyTotp } from "@/lib/totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890", 8 digits
const RFC = Buffer.from("12345678901234567890");

describe("one-time codes", () => {
  it("matches the RFC 4226 HOTP test vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((e, i) => expect(hotp(RFC, i)).toBe(e));
  });
  it("matches the RFC 6238 TOTP test vectors", () => {
    expect(totpAt(RFC, 59_000, 8)).toBe("94287082");
    expect(totpAt(RFC, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpAt(RFC, 1_111_111_111_000, 8)).toBe("14050471");
    expect(totpAt(RFC, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totpAt(RFC, 2_000_000_000_000, 8)).toBe("69279037");
  });
  it("gives the 6-digit form of the same code", () => expect(totpAt(RFC, 59_000)).toBe("287082"));
});

describe("checking a code", () => {
  const now = 1_700_000_000_000;
  const code = totpAt(RFC, now);
  it("accepts the current code", () => expect(verifyTotp(RFC, code, now)).not.toBeNull());
  it("accepts a code from the step before or after (clock drift)", () => {
    expect(verifyTotp(RFC, totpAt(RFC, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(RFC, totpAt(RFC, now + 30_000), now)).not.toBeNull();
  });
  it("rejects an old code, a wrong code and rubbish", () => {
    expect(verifyTotp(RFC, totpAt(RFC, now - 120_000), now)).toBeNull();
    expect(verifyTotp(RFC, code === "000000" ? "000001" : "000000", now)).toBeNull();
    for (const x of ["", "12345", "1234567", "abcdef", "12 34"]) expect(verifyTotp(RFC, x, now)).toBeNull();
  });
  it("ignores spaces people type", () => expect(verifyTotp(RFC, code.slice(0, 3) + " " + code.slice(3), now)).not.toBeNull());
});

describe("base32", () => {
  it("round-trips", () => {
    const s = newSecret();
    expect(base32Decode(base32Encode(s)).equals(s)).toBe(true);
  });
  it("matches the RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi").toString()).toBe("foobar");
  });
  it("makes a 32-character secret from 20 bytes", () => expect(base32Encode(newSecret())).toHaveLength(32));
  it("refuses characters that aren't base32", () => expect(() => base32Decode("0189")).toThrow());
});

describe("stored secrets", () => {
  it("encrypts and decrypts", () => {
    const s = newSecret();
    const enc = encryptSecret(s);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(base32Encode(s));
    expect(decryptSecret(enc)?.equals(s)).toBe(true);
  });
  it("uses a fresh nonce each time", () => { const s = newSecret(); expect(encryptSecret(s)).not.toBe(encryptSecret(s)); });
  it("refuses tampered or foreign data", () => {
    const enc = encryptSecret(newSecret());
    expect(decryptSecret(enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA"))).toBeNull();
    expect(decryptSecret("nonsense")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});

describe("authenticator link and recovery codes", () => {
  it("builds the otpauth link authenticator apps read", () => {
    const u = otpauthUri("JBSWY3DPEHPK3PXP", "owner@nexpreneur.example", "Nexpreneur OS");
    expect(u).toContain("otpauth://totp/Nexpreneur%20OS%3Aowner%40nexpreneur.example");
    expect(u).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(u).toContain("issuer=Nexpreneur%20OS");
  });
  it("makes ten distinct codes in XXXXX-XXXXX form without look-alike characters", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });
  it("matches a code however it is typed", () => {
    const c = "ABCDE-FGH23";
    expect(hashRecovery(c)).toBe(hashRecovery("abcde fgh23"));
    expect(hashRecovery(c)).toBe(hashRecovery("ABCDEFGH23"));
    expect(normalizeRecovery("ab-cd")).toBe("ABCD");
    expect(hashRecovery(c)).not.toBe(hashRecovery("ABCDE-FGH24"));
  });
});
