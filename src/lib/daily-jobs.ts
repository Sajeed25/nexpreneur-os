import "server-only";
import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CYCLE_MONTHS, addDays, addMonths, daysBetween } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { issueInvoice } from "@/lib/invoicing";
import { emailInvoice, emailReminder } from "@/lib/invoice-mail";
import { notify } from "@/lib/notify";

const { memberships, membershipPlans, users, invoices } = schema;

export const RENEWAL_LEAD_DAYS = 3; // issue the renewal invoice this many days before the renewal date
export const REMIND_WITHIN_DAYS = 2; // first reminder when an invoice is due within this many days
export const REMIND_EVERY_DAYS = 3;
export const MAX_REMINDERS = 5;

/** Issues the next invoice for every active membership whose renewal date is close, then moves the renewal date forward. Safe to run repeatedly. */
export async function runRenewals(today = todayIST()) {
  const d = db();
  const cutoff = addDays(today, RENEWAL_LEAD_DAYS);
  const due = await d.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.status, "active"), lte(memberships.renewalDate, cutoff))).limit(500);
  let issued = 0, errors = 0;
  for (const { id } of due) {
    try {
      const invoiceId = await d.transaction(async (tx) => {
        // Re-read under a lock: a second run (or another server) must not issue the same renewal twice.
        const [m] = await tx.select().from(memberships).where(eq(memberships.id, id)).for("update");
        if (!m || m.status !== "active" || m.renewalDate > cutoff) return null;
        const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, m.planId));
        if (!plan || plan.deletedAt) return null;
        const start = m.renewalDate;
        const end = addMonths(start, CYCLE_MONTHS[plan.billingCycle] ?? 1);
        const invId = await issueInvoice(tx, { org: m.organizationId, uid: null }, m.userId,
          [{ description: `${plan.name} membership renewal (${start} to ${end})`, qty: 1, unitPaise: plan.pricePaise, taxPct: 18 }],
          today, false, null, Math.max(3, daysBetween(today, start)), { locationId: m.locationId });
        await tx.update(memberships).set({ renewalDate: end }).where(eq(memberships.id, m.id));
        await notify(tx, { org: m.organizationId, userId: m.userId, kind: "renewal", title: `${plan.name} renews on ${start}`, body: "Your renewal invoice is ready.", link: `/invoices/${invId}` });
        return { invId, org: m.organizationId };
      });
      if (invoiceId) { issued++; await emailInvoice(invoiceId.org, invoiceId.invId); }
    } catch (e) {
      errors++;
      console.error("renewal failed for membership", id, e);
    }
  }
  return { issued, errors };
}

/** Reminds about invoices that are due soon or overdue: at most one every few days, and not forever. */
export async function runReminders(today = todayIST()) {
  const d = db();
  const soon = addDays(today, REMIND_WITHIN_DAYS);
  const wait = new Date(Date.now() - REMIND_EVERY_DAYS * 86_400_000);
  const rows = await d.select({ i: invoices, u: users }).from(invoices).innerJoin(users, eq(users.id, invoices.userId))
    .where(and(inArray(invoices.status, ["unpaid", "partial"]), lte(invoices.dueDate, soon), lt(invoices.reminderCount, MAX_REMINDERS), or(isNull(invoices.lastRemindedAt), lte(invoices.lastRemindedAt, wait)), isNull(users.deletedAt))).limit(500);
  let sent = 0, errors = 0;
  for (const { i, u } of rows) {
    if (i.totalPaise - i.paidPaise <= 0) continue;
    try {
      const overdue = i.dueDate < today;
      // Claim the reminder first so a parallel run can't send it twice.
      const claim = await d.update(invoices).set({ lastRemindedAt: new Date(), reminderCount: i.reminderCount + 1 })
        .where(and(eq(invoices.id, i.id), eq(invoices.reminderCount, i.reminderCount)));
      if (!(claim[0] as { affectedRows?: number }).affectedRows) continue;
      await notify(d, { org: i.organizationId, userId: i.userId, kind: "reminder", title: overdue ? `Overdue: ${i.number}` : `Due soon: ${i.number}`, body: `Balance ₹${((i.totalPaise - i.paidPaise) / 100).toLocaleString("en-IN")}, due ${i.dueDate}`, link: `/invoices/${i.id}` });
      await emailReminder(i, u, overdue);
      sent++;
    } catch (e) {
      errors++;
      console.error("reminder failed for invoice", i.id, e);
    }
  }
  return { sent, errors };
}
