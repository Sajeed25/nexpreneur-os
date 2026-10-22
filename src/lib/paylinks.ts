import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appUrl } from "@/lib/mailer";
import { rzp, rzpKeys } from "@/lib/payments-server";

const { invoices, users } = schema;

export class PayLinkError extends Error {}

/**
 * Creates a Razorpay Payment Link for what is still owed on an invoice and stores it on the invoice.
 * The amount always comes from our database. Making a new link cancels the old one, so only one is live at a time.
 */
export async function createPayLink(org: string, invoiceId: string): Promise<{ url: string; id: string; amountPaise: number; number: string; customer: { name: string; email: string; userId: string } }> {
  if (!rzpKeys()) throw new PayLinkError("Online payments aren't set up yet. Add the Razorpay keys first.");
  const [row] = await db().select({ i: invoices, u: users }).from(invoices).innerJoin(users, eq(users.id, invoices.userId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org)));
  if (!row) throw new PayLinkError("Invoice not found");
  const due = row.i.totalPaise - row.i.paidPaise;
  if (row.i.status === "void" || due <= 0) throw new PayLinkError("Nothing to pay on this invoice.");

  if (row.i.payLinkId) { // best effort: an old link must not be payable for a stale amount
    try { await rzp(`/payment_links/${encodeURIComponent(row.i.payLinkId)}/cancel`, { method: "POST", body: {} }); } catch { /* already paid, expired or cancelled */ }
  }
  const base = appUrl();
  const link = await rzp<{ id: string; short_url: string }>("/payment_links", { method: "POST", body: {
    amount: due, currency: "INR", accept_partial: false, reference_id: row.i.id, description: `Invoice ${row.i.number}`.slice(0, 2000),
    customer: { name: row.u.name.slice(0, 100), email: row.u.email },
    notify: { sms: false, email: false }, reminder_enable: false,
    expire_by: Math.floor(Date.now() / 1000) + 30 * 86_400,
    notes: { invoiceId: row.i.id, number: row.i.number },
    ...(base?.startsWith("https://") ? { callback_url: `${base}/invoices/${row.i.id}`, callback_method: "get" } : {}),
  } });
  await db().update(invoices).set({ payLinkId: link.id.slice(0, 40), payLinkUrl: link.short_url.slice(0, 300) }).where(eq(invoices.id, row.i.id));
  return { url: link.short_url, id: link.id, amountPaise: due, number: row.i.number, customer: { name: row.u.name, email: row.u.email, userId: row.u.id } };
}
