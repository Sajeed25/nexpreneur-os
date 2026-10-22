"use server";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { todayIST } from "@/lib/booking";
import { notify } from "@/lib/notify";
import { throttled } from "@/lib/auth";

const { marketplaceListings, listingContacts, perkRedemptions, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to use the marketplace.";
/** Partner perks are curated by the community team; any member may post their own offers and requests. */
const CURATORS = ["super_admin", "owner", "location_manager", "community_manager"];
const CATEGORIES = ["Design", "Development", "Marketing", "Legal & finance", "Hardware", "Training", "Food & drink", "Wellness", "Travel", "Other"] as const;

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "marketplace") ? s : null;
}

export type ListingDTO = {
  id: string; kind: "perk" | "offer" | "request"; title: string; description: string; priceText: string; category: string; link: string;
  validUntil: string | null; author: string; authorTitle: string; mine: boolean; at: string;
  redeemed: boolean; redeemCount: number; code: string | null; active: boolean;
};
export type ListingsData = { rows: ListingDTO[]; canCurate: boolean; categories: readonly string[] };

export async function listListings(kind: "perk" | "offer" | "request", q = ""): Promise<Result<ListingsData>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const term = q.trim().slice(0, 60).replace(/[%_]/g, "");
  const curator = CURATORS.includes(s.role);
  const today = todayIST();
  const rows = await db().select({ l: marketplaceListings, u: users }).from(marketplaceListings).innerJoin(users, eq(users.id, marketplaceListings.authorId))
    .where(and(
      eq(marketplaceListings.organizationId, s.org), eq(marketplaceListings.kind, kind), isNull(marketplaceListings.deletedAt),
      // people see live listings and their own; curators see everything, including switched-off ones
      curator ? undefined : or(eq(marketplaceListings.active, true), eq(marketplaceListings.authorId, s.uid)),
      term ? or(like(marketplaceListings.title, `%${term}%`), like(marketplaceListings.description, `%${term}%`), like(marketplaceListings.category, `%${term}%`)) : undefined,
    )).orderBy(desc(marketplaceListings.createdAt)).limit(100);
  const mine = await db().select({ id: perkRedemptions.listingId }).from(perkRedemptions).where(eq(perkRedemptions.userId, s.uid));
  const done = new Set(mine.map((m) => m.id));
  return { ok: true, data: { canCurate: curator, categories: CATEGORIES, rows: rows
    .filter(({ l }) => !l.validUntil || l.validUntil >= today || l.authorId === s.uid || curator)
    .map(({ l, u }) => ({
      id: l.id, kind: l.kind, title: l.title, description: l.description ?? "", priceText: l.priceText ?? "", category: l.category ?? "", link: l.link ?? "",
      validUntil: l.validUntil, author: u.name, authorTitle: [u.jobTitle, u.company].filter(Boolean).join(" · "), mine: l.authorId === s.uid, at: l.createdAt.toISOString(),
      redeemed: done.has(l.id), redeemCount: l.redeemCount, active: l.active,
      // The code is only ever sent to someone who has redeemed it (or the person who runs it).
      code: l.kind === "perk" && (done.has(l.id) || curator || l.authorId === s.uid) ? l.perkCode : null,
    })) } };
}

const listingIn = z.object({
  kind: z.enum(["perk", "offer", "request"]),
  title: z.string().trim().min(3, "Give it a short title").max(160),
  description: z.string().trim().max(2000),
  priceText: z.string().trim().max(80),
  category: z.enum(CATEGORIES),
  perkCode: z.string().trim().max(80),
  link: z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "A link must start with https://"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
});

export async function createListing(input: z.infer<typeof listingIn>): Promise<Result<{ id: string }>> {
  const s = await ctx();
  const p = listingIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? (p.error?.issues[0]?.message ?? "Check the details") : NO };
  if (p.data.kind === "perk" && !CURATORS.includes(s.role)) return { ok: false, error: "Only the community team can add partner perks." };
  if (throttled(`listing:${s.uid}`, 20, 24 * 3_600_000)) return { ok: false, error: "That's a lot of listings for one day. Try again tomorrow." };
  const id = crypto.randomUUID();
  await db().insert(marketplaceListings).values({
    id, organizationId: s.org, authorId: s.uid, kind: p.data.kind, title: p.data.title, description: p.data.description || null, priceText: p.data.priceText || null,
    category: p.data.category, perkCode: p.data.kind === "perk" ? p.data.perkCode || null : null, link: p.data.link || null, validUntil: p.data.validUntil || null,
  });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `listing.create:${p.data.kind}`, entity: "listing", entityId: id });
  return { ok: true, data: { id } };
}

/** Switch a listing off (or back on) or remove it. The person who posted it, or the community team, can do this. */
export async function setListingState(id: string, state: "on" | "off" | "remove"): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  const [l] = await db().select().from(marketplaceListings).where(and(eq(marketplaceListings.id, id), eq(marketplaceListings.organizationId, s.org), isNull(marketplaceListings.deletedAt)));
  if (!l) return { ok: false, error: "Listing not found" };
  if (l.authorId !== s.uid && !CURATORS.includes(s.role)) return { ok: false, error: "You can only change your own listings." };
  await db().update(marketplaceListings).set(state === "remove" ? { deletedAt: new Date(), active: false } : { active: state === "on" }).where(eq(marketplaceListings.id, id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `listing.${state}`, entity: "listing", entityId: id });
  return { ok: true, data: null };
}

/** "Get this perk": records that the person claimed it (once) and reveals the code. */
export async function redeemPerk(id: string): Promise<Result<{ code: string | null; link: string | null }>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  const [l] = await db().select().from(marketplaceListings).where(and(eq(marketplaceListings.id, id), eq(marketplaceListings.organizationId, s.org), eq(marketplaceListings.kind, "perk"), eq(marketplaceListings.active, true), isNull(marketplaceListings.deletedAt)));
  if (!l || (l.validUntil && l.validUntil < todayIST())) return { ok: false, error: "That perk isn't available any more." };
  try {
    await db().insert(perkRedemptions).values({ listingId: id, userId: s.uid });
    await db().update(marketplaceListings).set({ redeemCount: sql`${marketplaceListings.redeemCount} + 1` }).where(eq(marketplaceListings.id, id));
  } catch (e) {
    if (((e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code) !== "ER_DUP_ENTRY") throw e; // already claimed: show the code again
  }
  return { ok: true, data: { code: l.perkCode, link: l.link } };
}

const contactIn = z.object({ id: z.string().uuid(), message: z.string().trim().min(2, "Write a short message").max(500) });
/** Tells the person who posted that someone is interested, with the sender's name, email and phone so they can reply. One message per listing per day. */
export async function contactListing(input: z.infer<typeof contactIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = contactIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? (p.error?.issues[0]?.message ?? "Invalid request") : NO };
  const [l] = await db().select().from(marketplaceListings).where(and(eq(marketplaceListings.id, p.data.id), eq(marketplaceListings.organizationId, s.org), eq(marketplaceListings.active, true), isNull(marketplaceListings.deletedAt)));
  if (!l || l.kind === "perk") return { ok: false, error: "Listing not found" };
  if (l.authorId === s.uid) return { ok: false, error: "That's your own listing." };
  if (throttled(`lcontact:${s.uid}:${l.id}`, 1, 24 * 3_600_000) || throttled(`lcontact:${s.uid}`, 15, 24 * 3_600_000)) return { ok: false, error: "You've already messaged about this. They'll get back to you." };
  const [me] = await db().select({ email: users.email, phone: users.phone, company: users.company }).from(users).where(eq(users.id, s.uid));
  await db().insert(listingContacts).values({ listingId: l.id, userId: s.uid, message: p.data.message });
  await notify(db(), {
    org: s.org, userId: l.authorId, kind: "marketplace", title: `${s.name} is interested in “${l.title.slice(0, 60)}”`,
    body: `${p.data.message}\n— ${[me?.email, me?.phone].filter(Boolean).join(" · ")}`.slice(0, 500), link: "/marketplace",
  });
  return { ok: true, data: null };
}
