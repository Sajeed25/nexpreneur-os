"use server";
import { and, eq, isNull, like, or } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { kindLabel } from "@/lib/booking";

export type Hit = { label: string; sub: string; href: string };

/** Global search across what the signed-in role may see. Pattern characters in the query are escaped, results are capped. */
export async function globalSearch(q: string): Promise<Hit[]> {
  const s = await getSession();
  const term = typeof q === "string" ? q.trim().slice(0, 60) : "";
  if (!s || s.demo || !hasDb() || term.length < 2) return [];
  const pat = `%${term.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const d = db();
  const { users, resources, invoices, events, leads, companies } = schema;
  const out: Hit[] = [];

  const jobs: Promise<void>[] = [];
  if (can(s.role, "members")) jobs.push(d.select({ id: users.id, name: users.name, email: users.email }).from(users)
    .where(and(eq(users.organizationId, s.org), eq(users.role, "member"), isNull(users.deletedAt), or(like(users.name, pat), like(users.email, pat), like(users.company, pat)))).limit(5)
    .then((r) => { r.forEach((m) => out.push({ label: m.name, sub: `Member · ${m.email}`, href: `/members/${m.id}` })); }));
  if (can(s.role, "resources")) jobs.push(d.select({ name: resources.name, kind: resources.kind }).from(resources)
    .where(and(eq(resources.organizationId, s.org), isNull(resources.deletedAt), like(resources.name, pat))).limit(5)
    .then((r) => { r.forEach((x) => out.push({ label: x.name, sub: `Resource · ${kindLabel(x.kind)}`, href: "/resources" })); }));
  if (can(s.role, "invoices") && isFinance(s.role)) jobs.push(d.select({ id: invoices.id, number: invoices.number }).from(invoices)
    .where(and(eq(invoices.organizationId, s.org), like(invoices.number, pat))).limit(5)
    .then((r) => { r.forEach((i) => out.push({ label: i.number, sub: "Invoice", href: `/invoices/${i.id}` })); }));
  if (can(s.role, "events")) jobs.push(d.select({ title: events.title }).from(events)
    .where(and(eq(events.organizationId, s.org), like(events.title, pat))).limit(4)
    .then((r) => { r.forEach((e) => out.push({ label: e.title, sub: "Event", href: "/events" })); }));
  if (can(s.role, "crm")) jobs.push(d.select({ name: leads.name, company: leads.company }).from(leads)
    .where(and(eq(leads.organizationId, s.org), or(like(leads.name, pat), like(leads.company, pat)))).limit(4)
    .then((r) => { r.forEach((l) => out.push({ label: l.name, sub: `Lead${l.company ? ` · ${l.company}` : ""}`, href: "/crm" })); }));
  if (can(s.role, "companies") && isFinance(s.role)) jobs.push(d.select({ name: companies.name }).from(companies)
    .where(and(eq(companies.organizationId, s.org), isNull(companies.deletedAt), like(companies.name, pat))).limit(4)
    .then((r) => { r.forEach((c) => out.push({ label: c.name, sub: "Company", href: "/companies" })); }));

  await Promise.allSettled(jobs);
  return out.slice(0, 20);
}
