import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tx } from "@/lib/payments-server";
import { ONBOARDING_ITEMS, type OnboardingItemId } from "@/lib/onboarding-items";

const { memberOnboarding, invoices, organizations, users } = schema;
type Exec = ReturnType<typeof db> | Tx;

export type ItemState = {
  id: OnboardingItemId; label: string; hint: string; status: "pending" | "done" | "waived";
  auto: boolean; note: string | null; doneAt: string | null; refInvoiceId: string | null;
};
export type OnboardingState = { required: OnboardingItemId[]; items: ItemState[]; complete: boolean; blocks: boolean };

const VALID = new Set<string>(ONBOARDING_ITEMS.map((i) => i.id));

/** A deposit invoice was paid in full: tick the member's "deposit" item that pointed at it. */
export async function completeDepositItem(tx: Tx, inv: typeof invoices.$inferSelect) {
  await tx.update(memberOnboarding).set({ status: "done", doneAt: new Date(), note: `Paid on invoice ${inv.number}` })
    .where(and(eq(memberOnboarding.refInvoiceId, inv.id), eq(memberOnboarding.status, "pending")));
}

/** The checklist for one member. "Emergency contact" ticks itself from the profile; "deposit" ticks itself when its invoice is paid. */
export async function onboardingState(org: string, userId: string, exec: Exec = db()): Promise<OnboardingState> {
  const [o] = await exec.select({ items: organizations.onboardingItems, blocks: organizations.onboardingBlocks }).from(organizations).where(eq(organizations.id, org));
  const required = (o?.items ? o.items.split(",") : []).filter((x) => VALID.has(x)) as OnboardingItemId[];
  const [u] = await exec.select({ en: users.emergencyName, ep: users.emergencyPhone }).from(users).where(eq(users.id, userId));
  const rows = await exec.select().from(memberOnboarding).where(and(eq(memberOnboarding.organizationId, org), eq(memberOnboarding.userId, userId)));
  const items = ONBOARDING_ITEMS.filter((i) => required.includes(i.id)).map((i): ItemState => {
    const r = rows.find((x) => x.item === i.id);
    const auto = i.id === "emergency" && !!(u?.en && u?.ep);
    return {
      id: i.id, label: i.label, hint: i.hint, auto, note: r?.note ?? (auto ? "From the member's profile" : null), doneAt: r?.doneAt?.toISOString() ?? null, refInvoiceId: r?.refInvoiceId ?? null,
      status: auto ? "done" : (r?.status ?? "pending"),
    };
  });
  return { required, items, complete: items.every((i) => i.status !== "pending"), blocks: !!o?.blocks };
}

/** True when this organisation holds members back until onboarding is done, and this member isn't done. Staff are never blocked. */
export async function blockedByOnboarding(org: string, userId: string, role: string, exec: Exec = db()): Promise<{ blocked: boolean; missing: string[] }> {
  if (role !== "member") return { blocked: false, missing: [] };
  const s = await onboardingState(org, userId, exec);
  if (!s.blocks || s.complete) return { blocked: false, missing: [] };
  return { blocked: true, missing: s.items.filter((i) => i.status === "pending").map((i) => i.label) };
}

export async function setItem(org: string, userId: string, item: OnboardingItemId, status: "pending" | "done" | "waived", by: string | null, note: string | null, refInvoiceId?: string | null) {
  const d = db();
  const [ex] = await d.select({ id: memberOnboarding.id }).from(memberOnboarding).where(and(eq(memberOnboarding.userId, userId), eq(memberOnboarding.item, item)));
  const vals = { status, note: note?.slice(0, 255) ?? null, doneBy: status === "pending" ? null : by, doneAt: status === "pending" ? null : new Date(), ...(refInvoiceId !== undefined ? { refInvoiceId } : {}) };
  if (ex) await d.update(memberOnboarding).set(vals).where(eq(memberOnboarding.id, ex.id));
  else await d.insert(memberOnboarding).values({ organizationId: org, userId, item, ...vals });
}

/** Progress for many members at once (for the member list): how many required steps each has left. */
export async function pendingCounts(org: string, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const [o] = await db().select({ items: organizations.onboardingItems }).from(organizations).where(eq(organizations.id, org));
  const required = (o?.items ? o.items.split(",") : []).filter((x) => VALID.has(x));
  if (!required.length) return out;
  const rows = await db().select().from(memberOnboarding).where(and(eq(memberOnboarding.organizationId, org), inArray(memberOnboarding.userId, userIds)));
  const prof = await db().select({ id: users.id, en: users.emergencyName, ep: users.emergencyPhone }).from(users).where(inArray(users.id, userIds));
  for (const id of userIds) {
    const p = prof.find((x) => x.id === id);
    const left = required.filter((it) => {
      if (it === "emergency" && p?.en && p?.ep) return false;
      const r = rows.find((x) => x.userId === id && x.item === it);
      return !r || r.status === "pending";
    }).length;
    out.set(id, left);
  }
  return out;
}
