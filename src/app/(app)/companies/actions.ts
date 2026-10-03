"use server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";

const { companies, users, invoices, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type CompanyDTO = {
  id: string; name: string; gstin: string; address: string; email: string; phone: string;
  members: { id: string; name: string; email: string }[]; outstandingPaise: number;
};
const NO = "Sign in with a real account to use companies.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "companies") && isFinance(s.role) ? s : null;
}

export async function listCompanies(): Promise<Result<CompanyDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const cos = await db().select().from(companies).where(and(eq(companies.organizationId, s.org), isNull(companies.deletedAt))).orderBy(asc(companies.name)).limit(500);
  if (!cos.length) return { ok: true, data: [] };
  const ids = cos.map((c) => c.id);
  const people = await db().select({ id: users.id, name: users.name, email: users.email, companyId: users.companyId }).from(users)
    .where(and(eq(users.organizationId, s.org), isNull(users.deletedAt), inArray(users.companyId, ids))).orderBy(users.name);
  const owed = await db().select({ companyId: invoices.companyId, v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), inArray(invoices.companyId, ids), inArray(invoices.status, ["unpaid", "partial"]))).groupBy(invoices.companyId);
  return { ok: true, data: cos.map((c) => ({
    id: c.id, name: c.name, gstin: c.gstin ?? "", address: c.billingAddress ?? "", email: c.email ?? "", phone: c.phone ?? "",
    members: people.filter((p) => p.companyId === c.id).map((p) => ({ id: p.id, name: p.name, email: p.email })),
    outstandingPaise: Number(owed.find((o) => o.companyId === c.id)?.v ?? 0),
  })) };
}

/** Light list for the invoice form's company picker. */
export async function listCompanyOptions(): Promise<Result<{ id: string; name: string; gstin: string }[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select({ id: companies.id, name: companies.name, gstin: companies.gstin }).from(companies).where(and(eq(companies.organizationId, s.org), isNull(companies.deletedAt))).orderBy(asc(companies.name)).limit(500);
  return { ok: true, data: rows.map((r) => ({ id: r.id, name: r.name, gstin: r.gstin ?? "" })) };
}

const phone = z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )");
const companyIn = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  gstin: z.string().trim().toUpperCase().regex(/^([0-9A-Z]{15})?$/, "GSTIN must be 15 characters"),
  address: z.string().trim().max(500), email: z.string().trim().max(190).email("Enter a valid email").or(z.literal("")), phone,
});

export async function saveCompany(id: string | null, input: z.infer<typeof companyIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = companyIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = { name: p.data.name, gstin: p.data.gstin || null, billingAddress: p.data.address || null, email: p.data.email || null, phone: p.data.phone || null };
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
    await db().update(companies).set(v).where(and(eq(companies.id, id), eq(companies.organizationId, s.org)));
  } else {
    const nid = crypto.randomUUID();
    await db().insert(companies).values({ id: nid, organizationId: s.org, ...v });
    await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "company.create", entity: "company", entityId: nid });
  }
  return { ok: true, data: null };
}

export async function setCompanyMember(companyId: string, userId: string, member: boolean): Promise<Result<null>> {
  const s = await ctx();
  const ok = z.string().uuid();
  if (!s || !ok.safeParse(companyId).success || !ok.safeParse(userId).success) return { ok: false, error: s ? "Invalid request" : NO };
  const [c] = await db().select({ id: companies.id }).from(companies).where(and(eq(companies.id, companyId), eq(companies.organizationId, s.org), isNull(companies.deletedAt)));
  if (!c) return { ok: false, error: "Company not found" };
  await db().update(users).set({ companyId: member ? companyId : null }).where(and(eq(users.id, userId), eq(users.organizationId, s.org)));
  return { ok: true, data: null };
}

export async function deleteCompany(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: s ? "Invalid request" : NO };
  await db().update(users).set({ companyId: null }).where(and(eq(users.companyId, id), eq(users.organizationId, s.org)));
  await db().update(companies).set({ deletedAt: new Date() }).where(and(eq(companies.id, id), eq(companies.organizationId, s.org)));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "company.delete", entity: "company", entityId: id });
  return { ok: true, data: null };
}
