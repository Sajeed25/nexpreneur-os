"use server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance, toPaise } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { issueInvoice } from "@/lib/invoicing";
import { notify } from "@/lib/notify";
import { onboardingState, setItem, type OnboardingState } from "@/lib/onboarding";
import { DEFAULT_AGREEMENT, ONBOARDING_ITEMS } from "@/lib/onboarding-items";

const { users, organizations, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account.";
const EDITORS = ["super_admin", "owner", "location_manager", "reception"];

async function me() {
  const s = await getSession();
  return s && !s.demo && hasDb() ? s : null;
}

export type OnboardingDTO = { state: OnboardingState; agreementText: string; canEdit: boolean; canDeposit: boolean; self: boolean };

async function agreementFor(org: string) {
  const [o] = await db().select({ t: organizations.agreementText }).from(organizations).where(eq(organizations.id, org));
  return o?.t || DEFAULT_AGREEMENT;
}

/** A member's checklist. Staff with access to members can see anyone's; everyone can see their own. */
export async function getOnboarding(userId: string): Promise<Result<OnboardingDTO>> {
  const s = await me();
  if (!s || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Member not found" : NO };
  const self = s.uid === userId;
  if (!self && !can(s.role, "members")) return { ok: false, error: "You don't have permission to see that." };
  const [u] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org), isNull(users.deletedAt)));
  if (!u) return { ok: false, error: "Member not found" };
  return { ok: true, data: { state: await onboardingState(s.org, userId), agreementText: await agreementFor(s.org), canEdit: EDITORS.includes(s.role), canDeposit: isFinance(s.role), self } };
}

const itemIn = z.object({ item: z.enum(ONBOARDING_ITEMS.map((i) => i.id) as [string, ...string[]]), status: z.enum(["pending", "done", "waived"]), note: z.string().trim().max(255).optional() });
/** Staff tick a step off, waive it, or put it back. */
export async function setOnboardingItem(userId: string, input: z.infer<typeof itemIn>): Promise<Result<null>> {
  const s = await me();
  const p = itemIn.safeParse(input);
  if (!s || !p.success || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!EDITORS.includes(s.role)) return { ok: false, error: "You don't have permission to do that." };
  const [u] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org), isNull(users.deletedAt)));
  if (!u) return { ok: false, error: "Member not found" };
  await setItem(s.org, userId, p.data.item as "kyc", p.data.status, s.uid, p.data.note || null);
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `onboarding.${p.data.item}:${p.data.status}`, entity: "user", entityId: userId });
  if (p.data.status === "done") await notify(db(), { org: s.org, userId, kind: "onboarding", title: "One more step done", body: ONBOARDING_ITEMS.find((i) => i.id === p.data.item)?.label, link: "/dashboard" });
  return { ok: true, data: null };
}

/** The member accepts the membership agreement online. It is their own action, so only they can do it. */
export async function acceptAgreement(): Promise<Result<null>> {
  const s = await me();
  if (!s) return { ok: false, error: NO };
  await setItem(s.org, s.uid, "agreement", "done", s.uid, `Accepted online on ${todayIST()}`);
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "onboarding.agreement_accepted", entity: "user", entityId: s.uid });
  return { ok: true, data: null };
}

/** Raises a refundable-deposit invoice (no GST: it isn't a sale) and links it to the member's "deposit" step, which ticks itself once it is paid. */
export async function requestDeposit(userId: string, amountRupees: number): Promise<Result<{ invoiceId: string }>> {
  const s = await me();
  if (!s || !z.string().uuid().safeParse(userId).success || !(amountRupees > 0 && amountRupees <= 1_000_000)) return { ok: false, error: s ? "Enter a deposit amount" : NO };
  if (!isFinance(s.role)) return { ok: false, error: "You don't have permission to do that." };
  try {
    const invoiceId = await db().transaction(async (tx) => {
      const [u] = await tx.select({ id: users.id, loc: users.locationId }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org), isNull(users.deletedAt)));
      if (!u) throw new Error("NOT_FOUND");
      return issueInvoice(tx, s, userId, [{ description: "Security deposit (refundable)", qty: 1, unitPaise: toPaise(amountRupees), taxPct: 0 }], todayIST(), false, null, 7, { locationId: u.loc });
    });
    await setItem(s.org, userId, "deposit", "pending", null, `Deposit invoice raised`, invoiceId);
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "onboarding.deposit_requested", entity: "user", entityId: userId });
    return { ok: true, data: { invoiceId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === "NOT_FOUND" ? "Member not found" : "Couldn't raise the deposit invoice." };
  }
}
