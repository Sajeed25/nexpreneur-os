"use server";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { createPayLink, PayLinkError } from "@/lib/paylinks";
import { rupees } from "@/lib/booking";
import { notify } from "@/lib/notify";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { payLinkEmail } from "@/lib/emails-growth";
import { eq } from "drizzle-orm";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Finance: makes (or remakes) a Razorpay payment link for what is owed, and sends it to the customer:
 * in the app always, by email when email is set up, and by WhatsApp / SMS if they opted in.
 */
export async function sendPayLink(invoiceId: string): Promise<Result<{ url: string; emailed: boolean }>> {
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !can(s.role, "invoices") || !z.string().uuid().safeParse(invoiceId).success) return { ok: false, error: "Sign in with a real account." };
  if (!isFinance(s.role)) return { ok: false, error: "You don't have permission to do that." };
  try {
    const l = await createPayLink(s.org, invoiceId);
    const [inv] = await db().select({ due: schema.invoices.dueDate }).from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    const seller = process.env.SELLER_NAME ?? "Nexpreneur";
    await notify(db(), { org: s.org, userId: l.customer.userId, kind: "invoice", title: `Pay invoice ${l.number}`, body: `${rupees(l.amountPaise)} due. Pay securely: ${l.url}`, link: `/invoices/${invoiceId}` });
    let emailed = false;
    if (smtpConfigured()) {
      try {
        const m = payLinkEmail({ name: l.customer.name, number: l.number, amountPaise: l.amountPaise, dueDate: inv?.due ?? "", url: l.url, seller });
        await sendMail(l.customer.email, m.subject, m.text, m.html);
        emailed = true;
      } catch (e) { console.error("pay link email failed", e); }
    }
    await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.paylink", entity: "invoice", entityId: invoiceId });
    return { ok: true, data: { url: l.url, emailed } };
  } catch (e) {
    if (e instanceof PayLinkError) return { ok: false, error: e.message };
    console.error("sendPayLink failed", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Razorpay") ? e.message : "Couldn't create the payment link." };
  }
}
