import { describe, expect, it } from "vitest";
import { signProposal, verifyProposal } from "@/lib/ai-server";
import { authConfigured, readSession, signSession, throttled } from "@/lib/auth";

const book = { t: "book" as const, uid: "u1", resourceId: "r1", date: "2026-10-05", start: "10:00", end: "12:00" };

describe("AI confirmation tokens", () => {
  it("round-trips a valid proposal", () => {
    const p = verifyProposal(signProposal(book));
    expect(p).toMatchObject(book);
  });
  it("rejects a token whose payload was edited", () => {
    const [body, sig] = signProposal(book).split(".");
    const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), resourceId: "someone-elses" })).toString("base64url");
    expect(verifyProposal(`${evil}.${sig}`)).toBeNull();
  });
  it("rejects garbage and truncated tokens", () => {
    for (const t of ["", "abc", "a.b", "..", signProposal(book).slice(0, -3)]) expect(verifyProposal(t)).toBeNull();
  });
  it("rejects an expired token", () => expect(verifyProposal(signProposal(book, -1))).toBeNull());
  it("rejects a token signed with another secret", () => {
    const token = signProposal(book);
    const old = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-completely-different-secret-value";
    try { expect(verifyProposal(token)).toBeNull(); } finally { process.env.AUTH_SECRET = old; }
  });
});

describe("session cookies", () => {
  const s = { uid: "u1", org: "o1", name: "A", email: "a@b.in", role: "member" as const };
  it("round-trips", async () => expect(await readSession(await signSession(s))).toMatchObject(s));
  it("rejects tampering", async () => {
    const t = await signSession(s);
    const [h, p, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "owner" })).toString("base64url");
    expect(await readSession(`${h}.${forged}.${sig}`)).toBeNull();
  });
  it("rejects missing or junk tokens", async () => {
    expect(await readSession(undefined)).toBeNull();
    expect(await readSession("not.a.jwt")).toBeNull();
  });
  it("only requires a strong secret in production", () => expect(authConfigured()).toBe(true));
});

describe("rate limiting", () => {
  it("blocks after the limit and keys are independent", () => {
    const k = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(throttled(k, 3)).toBe(false);
    expect(throttled(k, 3)).toBe(true);
    expect(throttled(`other-${k}`, 3)).toBe(false);
  });
});
