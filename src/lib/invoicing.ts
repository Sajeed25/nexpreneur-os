import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { gst, invoiceNumber, SELLER_STATE, type Line } from "@/lib/billing";
import type { Tx } from "@/lib/payments-server";

const { invoices, invoiceItems, organizations, auditLogs } = schema;

/** Issues a numbered GST invoice inside the caller's transaction. Returns the new invoice id. */
export async function issueInvoice(tx: Tx, s: { org: string; uid: string }, userId: string, lines: Line[], issueDate: string, interstate: boolean, buyerGstin: string | null, dueInDays = 7) {
  // Lock the org row so invoice numbers are sequential with no gaps or duplicates.
  await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org)).for("update");
  const year = Number(issueDate.slice(0, 4));
  const [c] = await tx.select({ n: sql<number>`count(*)` }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), sql`${invoices.number} like ${`INV-${year}-%`}`));
  const number = invoiceNumber(year, Number(c.n) + 1);
  const t = gst(lines, interstate);
  const id = crypto.randomUUID();
  const due = new Date(new Date(`${issueDate}T00:00:00Z`).getTime() + dueInDays * 86_400_000).toISOString().slice(0, 10);
  await tx.insert(invoices).values({
    id, organizationId: s.org, userId, number, issueDate, dueDate: due, subtotalPaise: t.subtotal, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst,
    totalPaise: t.total, placeOfSupply: interstate ? "Other state" : SELLER_STATE, buyerGstin,
  });
  await tx.insert(invoiceItems).values(lines.map((l) => ({ invoiceId: id, description: l.description, qty: l.qty, unitPaise: l.unitPaise, taxPct: l.taxPct, hsnSac: l.hsnSac ?? "997212" })));
  await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.create", entity: "invoice", entityId: id });
  return id;
}
