import { describe, expect, it } from "vitest";
import { claimsEmail, emailAllowed } from "@/lib/oidc";

describe("which emails may sign in with SSO", () => {
  it("allows anyone when no domains are listed", () => expect(emailAllowed("a@anything.com", undefined)).toBe(true));
  it("allows only listed domains, in any letter case and with or without @", () => {
    expect(emailAllowed("Priya@Nexpreneur.in", "nexpreneur.in")).toBe(true);
    expect(emailAllowed("priya@nexpreneur.in", "@Nexpreneur.in, partner.org")).toBe(true);
    expect(emailAllowed("x@partner.org", "nexpreneur.in,partner.org")).toBe(true);
    expect(emailAllowed("evil@nexpreneur.in.attacker.com", "nexpreneur.in")).toBe(false);
    expect(emailAllowed("x@gmail.com", "nexpreneur.in")).toBe(false);
  });
  it("refuses something that isn't an email", () => { expect(emailAllowed("nope", undefined)).toBe(false); expect(emailAllowed("", "a.com")).toBe(false); });
});

describe("the email inside an id_token", () => {
  it("uses email", () => expect(claimsEmail({ email: "Aarav@Zenith.example", email_verified: true })).toBe("aarav@zenith.example"));
  it("falls back to preferred_username (Microsoft Entra)", () => expect(claimsEmail({ preferred_username: "meera@nexpreneur.in" })).toBe("meera@nexpreneur.in"));
  it("refuses an email the provider says is unverified", () => {
    expect(claimsEmail({ email: "a@b.com", email_verified: false })).toBeNull();
    expect(claimsEmail({ email: "a@b.com", email_verified: "false" })).toBeNull();
  });
  it("refuses a username that isn't an email, or nothing at all", () => {
    expect(claimsEmail({ preferred_username: "meera" })).toBeNull();
    expect(claimsEmail({})).toBeNull();
  });
});
