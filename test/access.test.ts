import { describe, expect, it } from "vitest";
import { decideAccess, normalizeCard, parseCredential, type AccessInput } from "@/lib/access-math";
import { makePass, passValid, cardHash, doorKeyHash, newDoorKey } from "@/lib/access";

const UID = "11111111-2222-3333-4444-555555555555";
const HYD = "loc-hyd", WGL = "loc-wgl";
type Override = Partial<Omit<AccessInput, "user">> & { user?: Partial<AccessInput["user"]> };
const base = (o: Override): AccessInput => ({
  doorLocationId: HYD, memberships: [], bookingNow: false, onboardingBlocked: false, ...o,
  user: { role: "member", deleted: false, locationId: null, ...o.user },
});

describe("who may enter", () => {
  it("lets a member with an active plan in", () => expect(decideAccess(base({ memberships: [{ status: "active", locationId: HYD }] }))).toEqual({ allow: true, reason: "Active plan" }));
  it("lets a member with a plan that isn't tied to a location in anywhere", () => expect(decideAccess(base({ memberships: [{ status: "active", locationId: null }] })).allow).toBe(true));
  it("keeps a paused or cancelled plan out", () => {
    expect(decideAccess(base({ memberships: [{ status: "paused", locationId: HYD }] })).allow).toBe(false);
    expect(decideAccess(base({ memberships: [{ status: "cancelled", locationId: HYD }] })).reason).toBe("No active plan or booking");
  });
  it("says so when the plan is for another location", () => expect(decideAccess(base({ memberships: [{ status: "active", locationId: WGL }] }))).toEqual({ allow: false, reason: "Plan is for another location" }));
  it("lets someone with a booking on right now in, without a plan", () => expect(decideAccess(base({ bookingNow: true }))).toEqual({ allow: true, reason: "Booking" }));
  it("keeps deactivated people out, whoever they are", () => {
    expect(decideAccess(base({ user: { deleted: true }, memberships: [{ status: "active", locationId: HYD }] })).allow).toBe(false);
    expect(decideAccess(base({ user: { role: "owner", deleted: true } })).reason).toBe("Account deactivated");
  });
  it("holds a member back until onboarding is done, but never staff", () => {
    expect(decideAccess(base({ onboardingBlocked: true, memberships: [{ status: "active", locationId: HYD }] }))).toEqual({ allow: false, reason: "Onboarding incomplete" });
    expect(decideAccess(base({ onboardingBlocked: true, user: { role: "reception" } })).allow).toBe(true);
  });
  it("lets owners in everywhere and other staff only at their own location", () => {
    expect(decideAccess(base({ user: { role: "owner", locationId: WGL } })).allow).toBe(true);
    expect(decideAccess(base({ user: { role: "reception", locationId: WGL } })).allow).toBe(false);
    expect(decideAccess(base({ user: { role: "reception", locationId: HYD } })).allow).toBe(true);
    expect(decideAccess(base({ user: { role: "finance", locationId: null } })).allow).toBe(true);
  });
});

describe("credentials", () => {
  it("reads a member pass", () => expect(parseCredential(`NX1.${UID}.29012345.abcdefghijklmnopqrstuv`)).toEqual({ kind: "pass", uid: UID, bucket: 29012345, sig: "abcdefghijklmnopqrstuv" }));
  it("reads a visitor code", () => expect(parseCredential("0123456789abcdef0123456789abcdef")).toEqual({ kind: "visitor", token: "0123456789abcdef0123456789abcdef" }));
  it("reads a card in any common spelling", () => {
    expect(parseCredential("rfid:04:a3:5b:1c")).toEqual({ kind: "card", card: "04A35B1C" });
    expect(parseCredential("RFID:04 A3 5B 1C")).toEqual({ kind: "card", card: "04A35B1C" });
    expect(normalizeCard("04-a3-5b-1c")).toBe("04A35B1C");
  });
  it("refuses rubbish", () => {
    for (const x of ["", "hello", "rfid:zz", "NX1.bad.1.x", "0123456789abcdef"]) expect(parseCredential(x)).toBeNull();
  });
});

describe("rotating pass", () => {
  const t = Date.UTC(2026, 9, 21, 10, 0, 30);
  const p = makePass(UID, t);
  const c = parseCredential(p.token);
  it("is valid now", () => { expect(c?.kind).toBe("pass"); if (c?.kind === "pass") expect(passValid(c.uid, c.bucket, c.sig, t)).toBe(true); });
  it("is valid a minute either side (clock drift) but not after that", () => {
    if (c?.kind !== "pass") throw new Error("pass");
    expect(passValid(c.uid, c.bucket, c.sig, t + 60_000)).toBe(true);
    expect(passValid(c.uid, c.bucket, c.sig, t - 60_000)).toBe(true);
    expect(passValid(c.uid, c.bucket, c.sig, t + 3 * 60_000)).toBe(false);
  });
  it("can't be reused for someone else or tampered with", () => {
    if (c?.kind !== "pass") throw new Error("pass");
    expect(passValid("99999999-2222-3333-4444-555555555555", c.bucket, c.sig, t)).toBe(false);
    expect(passValid(c.uid, c.bucket, c.sig.slice(0, -1) + (c.sig.endsWith("A") ? "B" : "A"), t)).toBe(false);
  });
  it("tells the phone when to refresh", () => expect(p.refreshInMs).toBe(30_000));
});

describe("keys and cards are stored hashed", () => {
  it("makes unique door keys and stores only their hash", () => {
    const a = newDoorKey(), b = newDoorKey();
    expect(a.key).toMatch(/^nxd_[A-Za-z0-9_-]{32}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(doorKeyHash(a.key));
    expect(a.hash).not.toContain(a.key);
  });
  it("hashes cards per organisation", () => {
    expect(cardHash("org1", "04A35B1C")).toBe(cardHash("org1", "04A35B1C"));
    expect(cardHash("org1", "04A35B1C")).not.toBe(cardHash("org2", "04A35B1C"));
  });
});
