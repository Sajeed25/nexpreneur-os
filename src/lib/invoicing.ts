import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { couponDiscount, gst, invoiceNumber, SELLER_STATE, type Line } from "@/lib/billing";
import type { Tx } from "@/lib/payments-server";
import { notify } from "@/lib/notify";

const { invoices, invoiceItems, organizations, auditLogs, coupons } = schema;

/** A problem the user can fix (bad or used-up coupon). Safe to show as-is. */
export class CouponError extends Error {}

/**
 * Validates a coupon and claims one use, inside the caller's transaction.
 * The "used_count < max_uses" check is part of the UPDATE, so two people can't both take the last use.
 */
export async function redeemCoupon(tx: Tx, org: string, rawCode: string, subtotalPaise: number) {
  const code = rawCode.trim().toUpperCase();
  const [c] = await tx.select().from(coupons).where(and(eq(coupons.organizationId, org), eq(coupons.code, code))).for("update");
  if (!c || !c.active) throw new CouponError("That coupon code isn't valid.");
  if (c.validUntil && c.validUntil < new Date().toISOString().slice(0, 10)) throw new CouponError("That coupon has expired.");
  const r = await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(and(eq(coupons.id, c.id), sql`(${coupons.maxUses} is null or ${coupons.usedCount} < ${coupons.maxUses})`));
  if (!(r[0] as { affectedRows?: number }).affectedRows) throw new CouponError("That coupon has been fully used.");
  return { code: c.code, discountPaise: couponDiscount(c.kind, c.value, subtotalPaise) };
}

export type InvoiceExtra = { couponCode?: string | null; locationId?: string | null; companyId?: string | null };

/** Issues a numbered GST invoice inside the caller's transaction. Returns the new invoice id. */
export async function issueInvoice(
  tx: Tx, s: { org: string; uid: string | null }, userId: string, lines: Line[], issueDate: string, interstate: boolean,
  buyerGstin: string | null, dueInDays = 7, extra: InvoiceExtra = {},
) {
  // Lock the org row so invoice numbers are sequential with no gaps or duplicates.
  await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org)).for("update");
  const year = Number(issueDate.slice(0, 4));
  const [c] = await tx.select({ n: sql<number>`count(*)` }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), sql`${invoices.number} like ${`INV-${year}-%`}`));
  const number = invoiceNumber(year, Number(c.n) + 1);

  const gross = lines.reduce((a, l) => a + l.qty * l.unitPaise, 0);
  const coupon = extra.couponCode ? await redeemCoupon(tx, s.org, extra.couponCode, gross) : null;
  const t = gst(lines, interstate, coupon?.discountPaise ?? 0);

  const id = crypto.randomUUID();
  const due = new Date(new Date(`${issueDate}T00:00:00Z`).getTime() + dueInDays * 86_400_000).toISOString().slice(0, 10);
  await tx.insert(invoices).values({
    id, organizationId: s.org, userId, number, issueDate, dueDate: due, subtotalPaise: t.subtotal, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst,
    totalPaise: t.total, placeOfSupply: interstate ? "Other state" : SELLER_STATE, buyerGstin,
    discountPaise: t.discount, couponCode: coupon?.code ?? null, locationId: extra.locationId ?? null, companyId: extra.companyId ?? null,
  });
  await tx.insert(invoiceItems).values(lines.map((l) => ({ invoiceId: id, description: l.description, qty: l.qty, unitPaise: l.unitPaise, taxPct: l.taxPct, hsnSac: l.hsnSac ?? "997212" })));
  await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.create", entity: "invoice", entityId: id });
  await notify(tx, { org: s.org, userId, kind: "invoice", title: `Invoice ${number} issued`, body: `Total ₹${(t.total / 100).toLocaleString("en-IN")}, due ${due}`, link: `/invoices/${id}` });
  return id;
}
