"use server";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { makePass } from "@/lib/access";

export type PassDTO = { dataUrl: string; refreshInMs: number; name: string; org: string; role: string; email: string };

/** The signed-in person's door pass as a QR image. It changes every minute, so the screen asks for a fresh one before it expires. */
export async function getMyPass(): Promise<{ ok: true; data: PassDTO } | { ok: false; error: string }> {
  const s = await getSession();
  if (!s || s.demo || !hasDb()) return { ok: false, error: "Sign in with a real account to see your pass." };
  const [o] = await db().select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, s.org));
  const p = makePass(s.uid);
  const dataUrl = await QRCode.toDataURL(p.token, { width: 320, margin: 1, errorCorrectionLevel: "M" });
  return { ok: true, data: { dataUrl, refreshInMs: p.refreshInMs, name: s.name, org: o?.name ?? "Nexpreneur", role: s.role, email: s.email } };
}
