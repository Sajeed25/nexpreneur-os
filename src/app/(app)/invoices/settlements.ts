"use server";
import QRCode from "qrcode";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { gst, isFinance, toPaise, type Line } from "@/lib/billing";
import { todayIST } from "@/lib/booking";
import { applyPayment } from "@/lib/payments-server";
import { notify } from "@/lib/notify";
import { sellerFor, sellerReady, type Seller } from "@/lib/seller";
import { buildEInvoice } from "@/lib/einvoice";
import { cancelEInvoiceRemote, einvoiceConfigured, submitEInvoice } from "@/lib/einvoice-server";
import { rzpKeys } from "@/lib/payments-server";

const { invoices, invoiceItems, auditLogs, organizations, creditNotes, creditNoteItems, companies, users } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account.";
const FORBIDDEN = "You don't have permission to do that.";
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "invoices") ? s : null;
}

// ---------- TDS ----------
const tdsIn = z.object({
  invoiceId: z.string().uuid(),
  /** Percent of the value before GST (Indian TDS is deducted on the taxable value). */
  percent: z.number().min(0.01).max(40).optional(),
  /** Or the exact amount in rupees, if the certificate says something different. */
  amount: z.number().positive().max(10_000_000).optional(),
  note: z.string().trim().max(200).optional(),
});

/**
 * The customer paid you less because they deducted TDS and will deposit it with the government. It settles that part of the
 * invoice (so it no longer shows as owed) without counting as money received, so revenue figures stay true.
 */
export async function recordTds(input: z.infer<typeof tdsIn>): Promise<Result<{ amountPaise: number }>> {
  const s = await ctx();
  if (!s) return fail(NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = tdsIn.safeParse(input);
  if (!p.success || (p.data.percent == null) === (p.data.amount == null)) return fail("Enter either a TDS percentage or an amount.");
  try {
    const amt = await db().transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, p.data.invoiceId), eq(invoices.organizationId, s.org))).for("update");
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "void" || inv.status === "paid") throw new Error("This invoice can't take more settlements.");
      const taxable = inv.subtotalPaise - inv.discountPaise;
      const amount = p.data.amount != null ? toPaise(p.data.amount) : Math.round((taxable * p.data.percent!) / 100);
      if (amount <= 0) throw new Error("That works out to nothing.");
      if (amount > inv.totalPaise - inv.paidPaise) throw new Error("TDS is more than the balance due.");
      const label = p.data.percent != null ? `TDS ${p.data.percent}% on ₹${(taxable / 100).toLocaleString("en-IN")}` : "TDS";
      await applyPayment(tx, s, inv, amount, "tds", { note: [label, p.data.note].filter(Boolean).join(" · ").slice(0, 255) });
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `payment.tds:${amount}`, entity: "invoice", entityId: inv.id });
      return amount;
    });
    return { ok: true, data: { amountPaise: amt } };
  } catch (e) {
    return fail(e instanceof Error && !/^(Failed query|Error:)/.test(e.message) ? e.message : "Couldn't record the TDS.");
  }
}

// ---------- Credit notes ----------
const cnLine = z.object({ description: z.string().trim().min(1).max(255), qty: z.number().int().min(1).max(10_000), price: z.number().min(0).max(10_000_000), taxPct: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]), hsnSac: z.string().trim().regex(/^\d{4,8}$/).optional() });
const cnIn = z.object({ invoiceId: z.string().uuid(), lines: z.array(cnLine).min(1).max(30), reason: z.string().trim().min(3, "Add a short reason").max(255) });

/**
 * A credit note reduces what a customer owes for an invoice (a discount after the fact, a cancelled item). It carries its own
 * GST, follows the invoice's tax type, and settles that much of the balance. If the invoice is already paid, the excess is
 * handed back through a refund; the result says how much.
 */
export async function createCreditNote(input: z.infer<typeof cnIn>): Promise<Result<{ id: string; number: string; settledPaise: number; refundDuePaise: number }>> {
  const s = await ctx();
  if (!s) return fail(NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const p = cnIn.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the credit note details");
  try {
    const out = await db().transaction(async (tx) => {
      await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org)).for("update"); // gap-free numbering
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, p.data.invoiceId), eq(invoices.organizationId, s.org))).for("update");
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "void") throw new Error("This invoice is void.");
      const lines: Line[] = p.data.lines.map((l) => ({ description: l.description, qty: l.qty, unitPaise: toPaise(l.price), taxPct: l.taxPct, hsnSac: l.hsnSac }));
      const t = gst(lines, inv.igstPaise > 0, 0);
      if (t.total <= 0) throw new Error("A credit note needs an amount.");
      const [prev] = await tx.select({ v: sql<number>`coalesce(sum(${creditNotes.totalPaise}), 0)` }).from(creditNotes).where(eq(creditNotes.invoiceId, inv.id));
      if (Number(prev.v) + t.total > inv.totalPaise) throw new Error("Credit notes can't add up to more than the invoice total.");

      const year = Number(todayIST().slice(0, 4));
      const [c] = await tx.select({ n: sql<number>`count(*)` }).from(creditNotes).where(and(eq(creditNotes.organizationId, s.org), sql`${creditNotes.number} like ${`CN-${year}-%`}`));
      const number = `CN-${year}-${String(Number(c.n) + 1).padStart(4, "0")}`;
      const id = crypto.randomUUID();
      await tx.insert(creditNotes).values({ id, organizationId: s.org, invoiceId: inv.id, userId: inv.userId, number, issueDate: todayIST(), subtotalPaise: t.subtotal, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, reason: p.data.reason, createdBy: s.uid });
      await tx.insert(creditNoteItems).values(lines.map((l) => ({ creditNoteId: id, description: l.description, hsnSac: l.hsnSac ?? "997212", qty: l.qty, unitPaise: l.unitPaise, taxPct: l.taxPct })));

      const balance = inv.totalPaise - inv.paidPaise;
      const settled = Math.min(t.total, Math.max(0, balance));
      if (settled > 0) await applyPayment(tx, s, inv, settled, "credit_note", { note: `${number}: ${p.data.reason}`.slice(0, 255) });
      await tx.insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "credit_note.create", entity: "invoice", entityId: inv.id });
      await notify(tx, { org: s.org, userId: inv.userId, kind: "invoice", title: `Credit note ${number}`, body: `₹${(t.total / 100).toLocaleString("en-IN")} credited on ${inv.number}`, link: `/invoices/${inv.id}` });
      return { id, number, settledPaise: settled, refundDuePaise: t.total - settled };
    });
    return { ok: true, data: out };
  } catch (e) {
    return fail(e instanceof Error && !/^(Failed query|Error:)/.test(e.message) ? e.message : "Couldn't create the credit note.");
  }
}

export type CreditNoteDetail = {
  id: string; number: string; issueDate: string; reason: string | null; invoiceId: string; invoiceNumber: string; invoiceDate: string;
  subtotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
  customer: { name: string; email: string; gstin: string | null; company: string | null };
  items: { description: string; hsnSac: string; qty: number; unitPaise: number; taxPct: number }[];
  seller: Seller;
};

export async function getCreditNote(id: string): Promise<Result<CreditNoteDetail>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Credit note not found" : NO);
  const [row] = await db().select({ c: creditNotes, i: invoices, u: users }).from(creditNotes)
    .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId)).innerJoin(users, eq(users.id, creditNotes.userId))
    .where(and(eq(creditNotes.id, id), eq(creditNotes.organizationId, s.org)));
  if (!row || (!isFinance(s.role) && row.c.userId !== s.uid)) return fail("Credit note not found");
  const items = await db().select().from(creditNoteItems).where(eq(creditNoteItems.creditNoteId, id));
  const [co] = row.i.companyId ? await db().select().from(companies).where(eq(companies.id, row.i.companyId)) : [];
  return { ok: true, data: {
    id: row.c.id, number: row.c.number, issueDate: row.c.issueDate, reason: row.c.reason, invoiceId: row.i.id, invoiceNumber: row.i.number, invoiceDate: row.i.issueDate,
    subtotalPaise: row.c.subtotalPaise, cgstPaise: row.c.cgstPaise, sgstPaise: row.c.sgstPaise, igstPaise: row.c.igstPaise, totalPaise: row.c.totalPaise,
    customer: { name: row.u.name, email: row.u.email, gstin: row.i.buyerGstin ?? co?.gstin ?? null, company: co?.name ?? null },
    items: items.map((x) => ({ description: x.description, hsnSac: x.hsnSac, qty: x.qty, unitPaise: x.unitPaise, taxPct: x.taxPct })),
    seller: await sellerFor(s.org, row.i.locationId),
  } };
}

// ---------- Everything the invoice screen needs beyond the invoice itself ----------
export type InvoiceExtras = {
  seller: Seller; logoUrl: string | null;
  payLinkUrl: string | null; onlineReady: boolean;
  creditNotes: { id: string; number: string; issueDate: string; totalPaise: number; reason: string | null }[];
  einvoice: { available: boolean; ready: boolean; needs: string | null; status: string | null; irn: string | null; ackNo: string | null; ackDate: string | null; error: string | null; qrDataUrl: string | null; canCancel: boolean } | null;
  taxableValuePaise: number;
};

export async function getInvoiceExtras(invoiceId: string): Promise<Result<InvoiceExtras>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(invoiceId).success) return fail(s ? "Invoice not found" : NO);
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, s.org)));
  if (!inv || (!isFinance(s.role) && inv.userId !== s.uid)) return fail("Invoice not found");
  const seller = await sellerFor(s.org, inv.locationId);
  const cns = await db().select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).orderBy(asc(creditNotes.createdAt));
  const fin = isFinance(s.role);
  let einv: InvoiceExtras["einvoice"] = null;
  if (fin || inv.irn) {
    const ready = sellerReady(seller);
    const generated = inv.irnStatus === "generated";
    einv = {
      available: einvoiceConfigured(), ready, needs: !einvoiceConfigured() ? "E-invoicing isn't connected yet (EINV_API_URL and EINV_API_TOKEN)." : !ready ? "Add your GSTIN, address and PIN code under Settings > Business profile." : null,
      status: inv.irnStatus, irn: inv.irn, ackNo: inv.irnAckNo, ackDate: inv.irnAckDate?.toISOString() ?? null, error: inv.irnError,
      qrDataUrl: generated && inv.irnSignedQr ? await QRCode.toDataURL(inv.irnSignedQr, { margin: 1, width: 180 }).catch(() => null) : null,
      canCancel: generated && !!inv.irnAckDate && Date.now() - inv.irnAckDate.getTime() < 24 * 3_600_000,
    };
  }
  return { ok: true, data: {
    seller, logoUrl: seller.logoImageId ? `/api/images/${seller.logoImageId}` : null,
    payLinkUrl: fin ? inv.payLinkUrl : null, onlineReady: !!rzpKeys(),
    creditNotes: cns.map((c) => ({ id: c.id, number: c.number, issueDate: c.issueDate, totalPaise: c.totalPaise, reason: c.reason })),
    einvoice: einv, taxableValuePaise: inv.subtotalPaise - inv.discountPaise,
  } };
}

// ---------- E-invoice (IRN) ----------
/** Sends a B2B invoice to the government's Invoice Registration Portal (through the configured gateway) and stores the IRN. */
export async function generateEInvoice(invoiceId: string): Promise<Result<{ irn: string }>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(invoiceId).success) return fail(s ? "Invoice not found" : NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  if (!einvoiceConfigured()) return fail("E-invoicing isn't connected yet. Ask your admin to set EINV_API_URL and EINV_API_TOKEN.");
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, s.org)));
  if (!inv) return fail("Invoice not found");
  if (inv.status === "void") return fail("This invoice is void.");
  if (inv.irnStatus === "generated") return fail("This invoice already has an IRN.");
  const [u] = await db().select().from(users).where(eq(users.id, inv.userId));
  const [co] = inv.companyId ? await db().select().from(companies).where(eq(companies.id, inv.companyId)) : [];
  const items = await db().select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  const seller = await sellerFor(s.org, inv.locationId);
  const built = buildEInvoice({
    invoice: inv, items,
    seller, buyer: { name: co?.name ?? u.company ?? u.name, gstin: (inv.buyerGstin ?? co?.gstin ?? "").toUpperCase(), address: co?.billingAddress ?? "", pincode: null },
  });
  if (!built.ok) return fail(built.error);
  const res = await submitEInvoice(built.payload);
  if (!res.ok) {
    await db().update(invoices).set({ irnStatus: "error", irnError: res.error.slice(0, 300) }).where(eq(invoices.id, inv.id));
    return fail(res.error);
  }
  await db().update(invoices).set({ irn: res.irn.irn, irnAckNo: res.irn.ackNo.slice(0, 30), irnAckDate: res.irn.ackDate, irnSignedQr: res.irn.signedQr, irnStatus: "generated", irnError: null }).where(eq(invoices.id, inv.id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.einvoice", entity: "invoice", entityId: inv.id });
  return { ok: true, data: { irn: res.irn.irn } };
}

const cancelIn = z.object({ invoiceId: z.string().uuid(), reason: z.enum(["1", "2", "3", "4"]), remark: z.string().trim().min(3, "Add a short remark").max(100) });
/** The IRP only allows cancelling within 24 hours of generating the IRN. */
export async function cancelEInvoice(input: z.infer<typeof cancelIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = cancelIn.safeParse(input);
  if (!s || !p.success) return fail(s ? (p.error?.issues[0]?.message ?? "Invalid request") : NO);
  if (!isFinance(s.role)) return fail(FORBIDDEN);
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, p.data.invoiceId), eq(invoices.organizationId, s.org)));
  if (!inv || inv.irnStatus !== "generated" || !inv.irn) return fail("This invoice has no active IRN.");
  if (!inv.irnAckDate || Date.now() - inv.irnAckDate.getTime() > 24 * 3_600_000) return fail("The 24-hour window to cancel an IRN has passed. Issue a credit note instead.");
  const r = await cancelEInvoiceRemote(inv.irn, p.data.reason, p.data.remark);
  if (!r.ok) return fail(r.error);
  await db().update(invoices).set({ irnStatus: "cancelled" }).where(eq(invoices.id, inv.id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "invoice.einvoice_cancel", entity: "invoice", entityId: inv.id });
  return { ok: true, data: null };
}
