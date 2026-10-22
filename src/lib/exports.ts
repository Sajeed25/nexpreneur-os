import "server-only";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CreditNoteRow, PaymentLine, SaleInvoice } from "@/lib/exports-math";

const { invoices, invoiceItems, users, companies, creditNotes, payments, organizations } = schema;
const IST_MS = 330 * 60_000;
export const istStart = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - IST_MS);
const ist = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

export type ExportData = { company: string; sales: SaleInvoice[]; creditNotes: CreditNoteRow[]; payments: PaymentLine[] };

/** Invoices issued, credit notes issued and money received between two IST dates (inclusive), optionally for one location. Voided invoices are left out. */
export async function loadExportData(org: string, from: string, to: string, locationId: string | null): Promise<ExportData> {
  const d = db();
  const [o] = await d.select({ name: organizations.name, legal: organizations.legalName }).from(organizations).where(eq(organizations.id, org));
  const loc = locationId ? eq(invoices.locationId, locationId) : undefined;

  const inv = await d.select({ i: invoices, u: users.name, c: companies.name, cg: companies.gstin }).from(invoices)
    .innerJoin(users, eq(users.id, invoices.userId)).leftJoin(companies, eq(companies.id, invoices.companyId))
    .where(and(eq(invoices.organizationId, org), ne(invoices.status, "void"), gte(invoices.issueDate, from), lt(invoices.issueDate, nextDay(to)), loc)).orderBy(invoices.issueDate, invoices.number).limit(20_000);
  const items = inv.length ? await d.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, inv.map((r) => r.i.id))) : [];
  const sales: SaleInvoice[] = inv.map(({ i, u, c, cg }) => ({
    number: i.number, date: i.issueDate, dueDate: i.dueDate, status: i.status, customer: u, company: c ?? null, gstin: (i.buyerGstin ?? cg ?? null) || null, placeOfSupply: i.placeOfSupply,
    subtotalPaise: i.subtotalPaise, discountPaise: i.discountPaise, cgstPaise: i.cgstPaise, sgstPaise: i.sgstPaise, igstPaise: i.igstPaise, totalPaise: i.totalPaise,
    items: items.filter((x) => x.invoiceId === i.id).map((x) => ({ description: x.description, hsnSac: x.hsnSac, qty: x.qty, unitPaise: x.unitPaise, taxPct: x.taxPct })),
  }));

  const cn = await d.select({ c: creditNotes, inv: invoices.number, ib: invoices.buyerGstin, u: users.name, co: companies.name, cg: companies.gstin }).from(creditNotes)
    .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId)).innerJoin(users, eq(users.id, creditNotes.userId)).leftJoin(companies, eq(companies.id, invoices.companyId))
    .where(and(eq(creditNotes.organizationId, org), gte(creditNotes.issueDate, from), lt(creditNotes.issueDate, nextDay(to)), loc)).orderBy(creditNotes.issueDate).limit(5_000);
  const notes: CreditNoteRow[] = cn.map(({ c, inv: n, ib, u, co, cg }) => ({
    number: c.number, date: c.issueDate, invoiceNumber: n, customer: u, company: co ?? null, gstin: (ib ?? cg ?? null) || null,
    subtotalPaise: c.subtotalPaise, cgstPaise: c.cgstPaise, sgstPaise: c.sgstPaise, igstPaise: c.igstPaise, totalPaise: c.totalPaise, reason: c.reason,
  }));

  const pays = await d.select({ p: payments, inv: invoices.number, u: users.name, co: companies.name }).from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(users, eq(users.id, payments.userId)).leftJoin(companies, eq(companies.id, invoices.companyId))
    .where(and(eq(payments.organizationId, org), ne(payments.status, "failed"), gte(payments.createdAt, istStart(from)), lt(payments.createdAt, istStart(nextDay(to))), loc)).orderBy(payments.createdAt).limit(30_000);
  const lines: PaymentLine[] = pays.map(({ p, inv: n, u, co }) => ({ date: ist(p.createdAt), invoiceNumber: n, customer: u, company: co ?? null, method: p.method, amountPaise: p.amountPaise, refundedPaise: p.refundedPaise, note: p.note }));

  return { company: o?.legal || o?.name || "Nexpreneur", sales, creditNotes: notes, payments: lines };
}

function nextDay(date: string) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}
