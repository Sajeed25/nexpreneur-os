"use server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isManager, toPaise } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { isAllLocations, matchLocations } from "@/lib/locations";
import { CouponError, issueInvoice } from "@/lib/invoicing";
import { notify } from "@/lib/notify";

const { services, serviceOrders, users, locations, images } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ServiceDTO = { id: string; name: string; description: string; pricePaise: number; taxPct: number; available: boolean; imageId: string | null };
export type OrderDTO = { id: string; who: string; service: string; qty: number; invoiceId: string | null; at: string };
const NO = "Sign in with a real account to use services.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "services") ? s : null;
}

export async function listServices(): Promise<Result<ServiceDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select().from(services)
    .where(and(eq(services.organizationId, s.org), isNull(services.deletedAt), isManager(s.role) ? undefined : eq(services.available, true))).orderBy(services.name).limit(200);
  return { ok: true, data: rows.map((r) => ({ id: r.id, name: r.name, description: r.description ?? "", pricePaise: r.pricePaise, taxPct: r.taxPct, available: r.available, imageId: r.imageId })) };
}

const serviceIn = z.object({
  name: z.string().trim().min(2, "Enter a name").max(160), description: z.string().trim().max(1000),
  price: z.number().min(0).max(1_000_000), taxPct: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  available: z.boolean(), imageId: z.string().uuid().optional(),
});
export async function saveService(id: string | null, input: z.infer<typeof serviceIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!isManager(s.role)) return { ok: false, error: "You don't have permission to manage services." };
  const p = serviceIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.imageId) {
    const [img] = await db().select({ id: images.id }).from(images).where(and(eq(images.id, p.data.imageId), eq(images.organizationId, s.org)));
    if (!img) return { ok: false, error: "That image wasn't found. Upload it again." };
  }
  const v = { name: p.data.name, description: p.data.description || null, pricePaise: toPaise(p.data.price), taxPct: p.data.taxPct, available: p.data.available, ...(p.data.imageId ? { imageId: p.data.imageId } : {}) };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
    await db().update(services).set(v).where(and(eq(services.id, id), eq(services.organizationId, s.org)));
  } else {
    await db().insert(services).values({ organizationId: s.org, ...v });
  }
  return { ok: true, data: null };
}

export async function setServiceAvailable(id: string, available: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  if (!isManager(s.role)) return { ok: false, error: "You don't have permission to manage services." };
  await db().update(services).set({ available }).where(and(eq(services.id, id), eq(services.organizationId, s.org)));
  return { ok: true, data: null };
}

const orderIn = z.object({ serviceId: z.string().uuid(), qty: z.number().int().min(1).max(50), couponCode: z.string().trim().max(40).optional(), loc: z.string().max(40).optional() });
/** Orders a service: creates the order and its GST invoice together. The price always comes from the database. */
export async function orderService(input: z.infer<typeof orderIn>): Promise<Result<{ invoiceId: string }>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = orderIn.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the quantity" };
  try {
    const invoiceId = await db().transaction(async (tx) => {
      const [svc] = await tx.select().from(services).where(and(eq(services.id, p.data.serviceId), eq(services.organizationId, s.org), isNull(services.deletedAt)));
      if (!svc || !svc.available) throw new Error("UNAVAILABLE");
      const locRows = await tx.select({ id: locations.id, name: locations.name, city: locations.city }).from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt)));
      const loc = isAllLocations(p.data.loc) ? undefined : { id: matchLocations(locRows, p.data.loc)[0] };
      const inv = await issueInvoice(tx, s, s.uid, [{ description: svc.name, qty: p.data.qty, unitPaise: svc.pricePaise, taxPct: svc.taxPct, hsnSac: "998599" }], todayIST(), false, null, 7, { couponCode: p.data.couponCode || null, locationId: loc?.id ?? null });
      await tx.insert(serviceOrders).values({ organizationId: s.org, userId: s.uid, serviceId: svc.id, qty: p.data.qty, invoiceId: inv });
      await notify(tx, { org: s.org, userId: s.uid, kind: "service", title: `Ordered: ${svc.name}${p.data.qty > 1 ? ` × ${p.data.qty}` : ""}`, link: `/invoices/${inv}` });
      return inv;
    });
    return { ok: true, data: { invoiceId } };
  } catch (e) {
    if (e instanceof CouponError) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message === "UNAVAILABLE" ? "That service isn't available right now." : "Couldn't place the order. Please try again." };
  }
}

export async function listOrders(): Promise<Result<OrderDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select({ o: serviceOrders, u: users, sv: services }).from(serviceOrders)
    .innerJoin(users, eq(users.id, serviceOrders.userId)).innerJoin(services, eq(services.id, serviceOrders.serviceId))
    .where(and(eq(serviceOrders.organizationId, s.org), isManager(s.role) ? undefined : eq(serviceOrders.userId, s.uid))).orderBy(desc(serviceOrders.createdAt)).limit(30);
  return { ok: true, data: rows.map(({ o, u, sv }) => ({ id: o.id, who: u.name, service: sv.name, qty: o.qty, invoiceId: o.invoiceId, at: o.createdAt.toISOString() })) };
}
