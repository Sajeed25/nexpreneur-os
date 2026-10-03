import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appUrl, sendMail, smtpConfigured } from "@/lib/mailer";
import { invoiceEmail, reminderEmail } from "@/lib/emails";

const { invoices, invoiceItems, users } = schema;

const seller = () => process.env.SELLER_NAME ?? "Nexpreneur";

/** Emails the invoice to its customer. Returns ok:false with a reason instead of throwing, so callers can carry on. */
export async function emailInvoice(org: string, invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  if (!smtpConfigured()) return { ok: false, error: "Email isn't set up yet." };
  try {
    const [row] = await db().select({ i: invoices, u: users }).from(invoices).innerJoin(users, eq(users.id, invoices.userId)).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org)));
    if (!row) return { ok: false, error: "Invoice not found" };
    const items = await db().select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    const base = appUrl();
    const m = invoiceEmail({
      number: row.i.number, customer: row.u.name, issueDate: row.i.issueDate, dueDate: row.i.dueDate, subtotalPaise: row.i.subtotalPaise, discountPaise: row.i.discountPaise,
      cgstPaise: row.i.cgstPaise, sgstPaise: row.i.sgstPaise, igstPaise: row.i.igstPaise, totalPaise: row.i.totalPaise, paidPaise: row.i.paidPaise,
      items: items.map((x) => ({ description: x.description, qty: x.qty, unitPaise: x.unitPaise })), seller: seller(), link: base ? `${base}/invoices/${invoiceId}` : null,
    });
    await sendMail(row.u.email, m.subject, m.text, m.html);
    await db().update(invoices).set({ emailedAt: new Date() }).where(eq(invoices.id, invoiceId));
    return { ok: true };
  } catch (e) {
    console.error("emailInvoice failed", e);
    return { ok: false, error: "Couldn't send the email." };
  }
}

export async function emailReminder(inv: typeof invoices.$inferSelect, user: { name: string; email: string }, overdue: boolean): Promise<boolean> {
  if (!smtpConfigured()) return false;
  try {
    const base = appUrl();
    const m = reminderEmail(user.name, inv.number, inv.totalPaise - inv.paidPaise, inv.dueDate, overdue, base ? `${base}/invoices/${inv.id}` : null);
    await sendMail(user.email, m.subject, m.text, m.html);
    return true;
  } catch (e) {
    console.error("emailReminder failed", e);
    return false;
  }
}
