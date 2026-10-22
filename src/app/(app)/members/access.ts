"use server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { normalizeCard } from "@/lib/access-math";
import { cardHash, recentEvents, type DoorEventDTO } from "@/lib/access";

const { accessCredentials, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account.";
const EDITORS = ["super_admin", "owner", "location_manager", "reception"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "members") ? s : null;
}

export type CardDTO = { id: string; label: string; active: boolean; createdAt: string };
export type MemberAccess = { cards: CardDTO[]; events: DoorEventDTO[]; canEdit: boolean };

export async function getMemberAccess(userId: string): Promise<Result<MemberAccess>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Member not found" : NO };
  const cards = await db().select().from(accessCredentials).where(and(eq(accessCredentials.userId, userId), eq(accessCredentials.organizationId, s.org))).orderBy(asc(accessCredentials.createdAt));
  return { ok: true, data: { cards: cards.map((c) => ({ id: c.id, label: c.label ?? "Card", active: c.active, createdAt: c.createdAt.toISOString() })), events: await recentEvents(s.org, { userId, limit: 15 }), canEdit: EDITORS.includes(s.role) } };
}

const cardIn = z.object({ cardId: z.string().trim().max(60), label: z.string().trim().max(60) });
/** Links a physical card to a member. Only a hash of the card number is stored. */
export async function addCard(userId: string, input: z.infer<typeof cardIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = cardIn.safeParse(input);
  if (!s || !p.success || !z.string().uuid().safeParse(userId).success) return { ok: false, error: s ? "Check the card details" : NO };
  if (!EDITORS.includes(s.role)) return { ok: false, error: "You don't have permission to do that." };
  const card = normalizeCard(p.data.cardId);
  if (!card) return { ok: false, error: "Enter the card's number: 6 to 32 letters and digits (A-F, 0-9), like 04:A3:5B:1C." };
  const [u] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, s.org), isNull(users.deletedAt)));
  if (!u) return { ok: false, error: "Member not found" };
  try {
    await db().insert(accessCredentials).values({ organizationId: s.org, userId, identifierHash: cardHash(s.org, card), label: p.data.label || `Card ending ${card.slice(-4)}` });
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    return { ok: false, error: code === "ER_DUP_ENTRY" ? "That card is already linked to someone." : "Couldn't link the card." };
  }
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "access.card_add", entity: "user", entityId: userId });
  return { ok: true, data: null };
}

export async function setCardActive(cardId: string, active: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(cardId).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!EDITORS.includes(s.role)) return { ok: false, error: "You don't have permission to do that." };
  await db().update(accessCredentials).set({ active }).where(and(eq(accessCredentials.id, cardId), eq(accessCredentials.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: active ? "access.card_enable" : "access.card_disable", entity: "access_credential", entityId: cardId });
  return { ok: true, data: null };
}
