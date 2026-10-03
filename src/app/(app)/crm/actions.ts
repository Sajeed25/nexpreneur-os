"use server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toPaise } from "@/lib/billing";
import { LEAD_STAGES, STAGE_LABEL } from "./stages";

const { leads, leadActivities, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type LeadDTO = {
  id: string; name: string; company: string; phone: string; email: string; requirements: string;
  plan: string; valuePaise: number; stage: string; at: string;
};
export type ActivityDTO = { id: string; kind: string; note: string; at: string };
const NO = "Sign in with a real account to use the CRM.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "crm") ? s : null;
}
const toDTO = (l: typeof leads.$inferSelect): LeadDTO => ({
  id: l.id, name: l.name, company: l.company ?? "", phone: l.phone ?? "", email: l.email ?? "", requirements: l.requirements ?? "",
  plan: l.interestedPlan ?? "", valuePaise: l.expectedValuePaise, stage: l.stage, at: l.createdAt.toISOString(),
});

export async function listLeads(): Promise<Result<LeadDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select().from(leads).where(eq(leads.organizationId, s.org)).orderBy(desc(leads.createdAt)).limit(500);
  return { ok: true, data: rows.map(toDTO) };
}

const leadIn = z.object({
  name: z.string().trim().min(2, "Enter a name").max(160), company: z.string().trim().max(160),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )"),
  email: z.string().trim().max(190).email("Enter a valid email").or(z.literal("")),
  requirements: z.string().trim().max(1000), plan: z.string().trim().max(120), value: z.number().min(0).max(100_000_000),
});
export async function createLead(input: z.infer<typeof leadIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = leadIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  const id = crypto.randomUUID();
  await db().insert(leads).values({ id, organizationId: s.org, name: v.name, company: v.company || null, phone: v.phone || null, email: v.email || null, requirements: v.requirements || null, interestedPlan: v.plan || null, expectedValuePaise: toPaise(v.value) });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "lead.create", entity: "lead", entityId: id });
  return { ok: true, data: null };
}

const moveIn = z.object({ id: z.string().uuid(), stage: z.enum(LEAD_STAGES) });
export async function moveLead(input: z.infer<typeof moveIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = moveIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? "Invalid request" : NO };
  const [l] = await db().select().from(leads).where(and(eq(leads.id, p.data.id), eq(leads.organizationId, s.org)));
  if (!l) return { ok: false, error: "Lead not found" };
  if (l.stage === p.data.stage) return { ok: true, data: null };
  await db().update(leads).set({ stage: p.data.stage }).where(eq(leads.id, l.id));
  await db().insert(leadActivities).values({ organizationId: s.org, leadId: l.id, kind: "stage", note: `Moved from ${STAGE_LABEL[l.stage]} to ${STAGE_LABEL[p.data.stage]}`, createdBy: s.uid });
  return { ok: true, data: null };
}

export async function listActivities(leadId: string): Promise<Result<ActivityDTO[]>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(leadId).success) return { ok: false, error: s ? "Invalid request" : NO };
  const rows = await db().select().from(leadActivities).where(and(eq(leadActivities.leadId, leadId), eq(leadActivities.organizationId, s.org))).orderBy(desc(leadActivities.createdAt)).limit(100);
  return { ok: true, data: rows.map((a) => ({ id: a.id, kind: a.kind, note: a.note, at: a.createdAt.toISOString() })) };
}

const noteIn = z.object({ leadId: z.string().uuid(), kind: z.enum(["note", "call"]), note: z.string().trim().min(1, "Write a note").max(1000) });
export async function addActivity(input: z.infer<typeof noteIn>): Promise<Result<null>> {
  const s = await ctx();
  const p = noteIn.safeParse(input);
  if (!s || !p.success) return { ok: false, error: s ? p.error?.issues[0]?.message ?? "Invalid request" : NO };
  const [l] = await db().select({ id: leads.id }).from(leads).where(and(eq(leads.id, p.data.leadId), eq(leads.organizationId, s.org)));
  if (!l) return { ok: false, error: "Lead not found" };
  await db().insert(leadActivities).values({ organizationId: s.org, leadId: l.id, kind: p.data.kind, note: p.data.note, createdBy: s.uid });
  return { ok: true, data: null };
}
