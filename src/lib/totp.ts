import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP, SHA-1, 30 s, 6 digits): what Google Authenticator,
// Microsoft Authenticator, Authy and 1Password all speak. No third-party library: it is a few lines of HMAC.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(c).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const totpAt = (secret: Buffer, timeMs: number, digits = 6, stepSec = 30) => hotp(secret, Math.floor(timeMs / 1000 / stepSec), digits);

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Accepts the current code and the one either side (phone clocks drift a little). Returns the matching time-step, or null. */
export function verifyTotp(secret: Buffer, code: string, now = Date.now(), window = 1): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 1000 / 30);
  for (let w = -window; w <= window; w++) if (same(hotp(secret, step + w), c)) return step + w;
  return null;
}

export const newSecret = () => randomBytes(20);

export const otpauthUri = (secretBase32: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// ---- The secret is stored encrypted (AES-256-GCM), so a copy of the database alone can't generate codes ----
function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (16+ chars)");
    return createHash("sha256").update("nx-totp-v1:dev-only-insecure-secret-change-me").digest();
  }
  return createHash("sha256").update(`nx-totp-v1:${s}`).digest();
}

export function encryptSecret(secret: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(secret), c.final()]);
  return `v1.${Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url")}`;
}

export function decryptSecret(stored: string | null | undefined): Buffer | null {
  if (!stored?.startsWith("v1.")) return null;
  try {
    const raw = Buffer.from(stored.slice(3), "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
  } catch {
    return null; // wrong key (AUTH_SECRET changed) or tampered
  }
}

// ---- Recovery codes: one-time codes for when the phone is lost ----
const RC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => { const b = randomBytes(10); const s = [...b].map((x) => RC[x % RC.length]).join(""); return `${s.slice(0, 5)}-${s.slice(5)}`; });
}
export const normalizeRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecovery = (code: string) => createHash("sha256").update(`recovery:${normalizeRecovery(code)}`).digest("hex");
