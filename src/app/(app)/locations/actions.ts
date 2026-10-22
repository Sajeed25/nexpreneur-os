"use server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isGstin } from "@/lib/gst";

const { locations, resources, memberships, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type LocationRow = {
  id: string; name: string; city: string; resources: number; activeMembers: number;
  legalName: string; gstin: string; address: string; phone: string; email: string; logoImageId: string | null; brandColor: string; invoiceFooter: string;
};
const NO = "Sign in with a real account to manage locations.";
const OWNERS = ["super_admin", "owner"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "locations") ? s : null;
}

export async function listLocationRows(): Promise<Result<{ rows: LocationRow[]; canEdit: boolean }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const d = db();
  const [locs, rs, ms] = await Promise.all([
    d.select().from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt))).orderBy(asc(locations.createdAt)),
    d.select({ id: resources.locationId, n: sql<number>`count(*)` }).from(resources).where(and(eq(resources.organizationId, s.org), isNull(resources.deletedAt))).groupBy(resources.locationId),
    d.select({ id: memberships.locationId, n: sql<number>`count(distinct ${memberships.userId})` }).from(memberships).where(and(eq(memberships.organizationId, s.org), eq(memberships.status, "active"))).groupBy(memberships.locationId),
  ]);
  return { ok: true, data: { canEdit: OWNERS.includes(s.role), rows: locs.map((l) => ({
    id: l.id, name: l.name, city: l.city ?? "", resources: Number(rs.find((r) => r.id === l.id)?.n ?? 0), activeMembers: Number(ms.find((m) => m.id === l.id)?.n ?? 0),
    legalName: l.legalName ?? "", gstin: l.gstin ?? "", address: l.address ?? "", phone: l.phone ?? "", email: l.email ?? "",
    logoImageId: l.logoImageId, brandColor: l.brandColor ?? "", invoiceFooter: l.invoiceFooter ?? "",
  })) } };
}

const brandIn = z.object({
  legalName: z.string().trim().max(160),
  gstin: z.string().trim().toUpperCase().max(15).refine((v) => v === "" || isGstin(v), "That GSTIN isn't valid. It has 15 characters, like 36AABCN1234F1Z5."),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )"),
  email: z.string().trim().max(190).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  brandColor: z.string().trim().refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Pick a colour"),
  invoiceFooter: z.string().trim().max(500),
  logoImageId: z.string().uuid().nullable(),
});

/** Details printed on this location's invoices, credit notes and emails. Anything left blank falls back to the business profile. */
export async function saveLocationBranding(id: string, input: z.infer<typeof brandIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!OWNERS.includes(s.role)) return { ok: false, error: "Only owners can change branding." };
  const p = brandIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the details" };
  const v = p.data;
  if (v.logoImageId) {
    const [img] = await db().select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.id, v.logoImageId), eq(schema.images.organizationId, s.org)));
    if (!img) return { ok: false, error: "That logo wasn't found. Upload it again." };
  }
  await db().update(locations).set({
    legalName: v.legalName || null, gstin: v.gstin || null, address: v.address || null, phone: v.phone || null, email: v.email || null,
    brandColor: v.brandColor || null, invoiceFooter: v.invoiceFooter || null, logoImageId: v.logoImageId,
  }).where(and(eq(locations.id, id), eq(locations.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "location.branding", entity: "location", entityId: id });
  return { ok: true, data: null };
}

const locIn = z.object({ name: z.string().trim().min(2, "Enter a name").max(120), city: z.string().trim().max(120) });

export async function saveLocation(id: string | null, input: z.infer<typeof locIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!OWNERS.includes(s.role)) return { ok: false, error: "Only owners can add or rename locations." };
  const p = locIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
    await db().update(locations).set({ name: p.data.name, city: p.data.city || null }).where(and(eq(locations.id, id), eq(locations.organizationId, s.org)));
  } else {
    const nid = crypto.randomUUID();
    await db().insert(locations).values({ id: nid, organizationId: s.org, name: p.data.name, city: p.data.city || null });
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "location.add", entity: "location", entityId: nid });
  }
  return { ok: true, data: null };
}

/** A location can only be archived once it has no resources and no active members, so nothing is left pointing at it. */
export async function archiveLocation(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!OWNERS.includes(s.role)) return { ok: false, error: "Only owners can archive locations." };
  const list = await listLocationRows();
  const row = list.ok ? list.data.rows.find((r) => r.id === id) : undefined;
  if (!row) return { ok: false, error: "Location not found" };
  if (list.ok && list.data.rows.length <= 1) return { ok: false, error: "You need at least one location." };
  if (row.resources > 0) return { ok: false, error: `It still has ${row.resources} resources. Archive or move them first.` };
  if (row.activeMembers > 0) return { ok: false, error: `It still has ${row.activeMembers} active members.` };
  await db().update(locations).set({ deletedAt: new Date() }).where(and(eq(locations.id, id), eq(locations.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "location.archive", entity: "location", entityId: id });
  return { ok: true, data: null };
}
