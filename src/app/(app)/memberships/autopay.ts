"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AutopayError, cancelMandate, createMandate, mandatesFor, renewalAmount, ACTIVE_MANDATE, type MandateDTO } from "@/lib/autopay";
import { rzpKeys } from "@/lib/payments-server";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to manage autopay.";

async function me() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "memberships") ? s : null;
}

export type AutopayDTO = {
  enabled: boolean;
  items: { membershipId: string; plan: string; renewalDate: string; amountPaise: number; mandate: MandateDTO | null }[];
};

/** The signed-in person's active memberships and whether each has autopay. */
export async function getMyAutopay(): Promise<Result<AutopayDTO>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select({ m: schema.memberships, p: schema.membershipPlans }).from(schema.memberships)
    .innerJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.memberships.planId))
    .where(and(eq(schema.memberships.userId, s.uid), eq(schema.memberships.organizationId, s.org), eq(schema.memberships.status, "active")));
  const mandates = await mandatesFor(s.org, s.uid);
  return { ok: true, data: { enabled: !!rzpKeys(), items: rows.map(({ m, p }) => ({
    membershipId: m.id, plan: p.name, renewalDate: m.renewalDate, amountPaise: renewalAmount(p.pricePaise),
    mandate: mandates.find((x) => x.membershipId === m.id && ACTIVE_MANDATE.includes(x.status)) ?? null,
  })) } };
}

/** Only the member can set up their own autopay: it is their consent to be charged. */
export async function startAutopay(membershipId: string): Promise<Result<{ url: string }>> {
  const s = await me();
  if (!s || !z.string().uuid().safeParse(membershipId).success) return { ok: false, error: s ? "Invalid request" : NO };
  try {
    const r = await createMandate(s.org, s.uid, membershipId);
    await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "autopay.start", entity: "membership", entityId: membershipId });
    return { ok: true, data: { url: r.url } };
  } catch (e) {
    if (e instanceof AutopayError) return { ok: false, error: e.message };
    console.error("startAutopay failed", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Razorpay") ? e.message : "Couldn't set up autopay." };
  }
}

export async function stopAutopay(mandateId: string): Promise<Result<null>> {
  const s = await me();
  if (!s || !z.string().uuid().safeParse(mandateId).success) return { ok: false, error: s ? "Invalid request" : NO };
  try {
    await cancelMandate(s.org, s.uid, mandateId);
    await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "autopay.stop", entity: "autopay", entityId: mandateId });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof AutopayError ? e.message : "Couldn't turn off autopay." };
  }
}
