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

import { hashToken, newResetToken, sessionRevoked } from "@/lib/reset-token";
import { appUrl } from "@/lib/mailer";

describe("password reset tokens", () => {
  it("makes unguessable unique tokens and stores only their hash", () => {
    const a = newResetToken(), b = newResetToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toHaveLength(64);
  });
  it("revokes sessions issued before a password change, not after", () => {
    const changed = new Date("2026-10-03T10:00:00.700Z");
    const at = (s: string) => Math.floor(new Date(s).getTime() / 1000);
    expect(sessionRevoked(at("2026-10-03T09:59:59Z"), changed)).toBe(true);
    expect(sessionRevoked(at("2026-10-03T10:00:00.900Z"), changed)).toBe(false); // the fresh session issued by the change itself
    expect(sessionRevoked(at("2026-10-03T10:05:00Z"), changed)).toBe(false);
    expect(sessionRevoked(undefined, changed)).toBe(true);
    expect(sessionRevoked(123, null)).toBe(false);
  });
});

describe("reset link base URL", () => {
  it("only trusts configured https URLs, never request data", () => {
    const old = process.env.AUTH_URL;
    try {
      for (const bad of ["", "placeholder", "http://evil.test", "https://a.test/path", "javascript:alert(1)"]) { process.env.AUTH_URL = bad; expect(appUrl()).toBeNull(); }
      process.env.AUTH_URL = "https://os.nexpreneur.com"; expect(appUrl()).toBe("https://os.nexpreneur.com");
    } finally { process.env.AUTH_URL = old; }
  });
});

import { decodeJwtPayload, newPkce, signBlob, validGoogleClaims, verifyBlob } from "@/lib/oauth";
import { esc } from "@/lib/emails";

describe("Google sign-in checks", () => {
  const ok = { iss: "https://accounts.google.com", aud: "cid", exp: 2_000_000_000, email: "a@b.in", email_verified: true };
  it("accepts a good token and rejects bad claims", () => {
    expect(validGoogleClaims(ok, "cid", 1_900_000_000)).toBe(true);
    expect(validGoogleClaims({ ...ok, aud: "other" }, "cid", 1_900_000_000)).toBe(false);
    expect(validGoogleClaims({ ...ok, iss: "https://evil.test" }, "cid", 1_900_000_000)).toBe(false);
    expect(validGoogleClaims({ ...ok, exp: 1_800_000_000 }, "cid", 1_900_000_000)).toBe(false);
    expect(validGoogleClaims({ ...ok, email_verified: false }, "cid", 1_900_000_000)).toBe(false);
    expect(validGoogleClaims({ ...ok, email: undefined }, "cid", 1_900_000_000)).toBe(false);
  });
  it("decodes a JWT payload and survives junk", () => {
    const jwt = `h.${Buffer.from(JSON.stringify({ email: "x@y.in" })).toString("base64url")}.s`;
    expect(decodeJwtPayload(jwt)?.email).toBe("x@y.in");
    expect(decodeJwtPayload("nonsense")).toBeNull();
  });
  it("signs the state cookie so it can't be forged or replayed after expiry", () => {
    const t = signBlob({ state: "s1", verifier: "v1" });
    expect(verifyBlob<{ state: string }>(t)?.state).toBe("s1");
    const [b, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ state: "evil", verifier: "v1", exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifyBlob(`${forged}.${sig}`)).toBeNull();
    expect(verifyBlob(signBlob({ state: "s" }, -1))).toBeNull();
    expect(verifyBlob(undefined)).toBeNull();
    void b;
  });
  it("makes distinct PKCE values", () => {
    const a = newPkce(), b = newPkce();
    expect(a.state).not.toBe(b.state);
    expect(a.challenge).not.toBe(a.verifier);
  });
});

describe("email HTML escaping", () => {
  it("neutralises markup from user-supplied names", () => {
    expect(esc(`<img src=x onerror="alert(1)">&'`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
    expect(esc(null)).toBe("");
  });
});

import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/images";

describe("image upload checks", () => {
  const pad = (b: number[]) => new Uint8Array([...b, ...new Array(20).fill(0)]);
  it("recognises JPEG, PNG and WebP by their bytes", () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });
  it("rejects SVG, HTML, scripts and empty files, whatever they're named", () => {
    const enc = (s: string) => new TextEncoder().encode(s.padEnd(32, " "));
    expect(sniffImage(enc("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffImage(enc("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffImage(enc("GIF89a"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it("caps the size", () => expect(MAX_IMAGE_BYTES).toBeLessThanOrEqual(1024 * 1024));
});
