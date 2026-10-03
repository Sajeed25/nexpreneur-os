"use server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

const { supportTickets, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type TicketDTO = { id: string; who: string; subject: string; body: string; status: string; at: string };

const STAFF = ["super_admin", "owner", "location_manager", "reception"];
async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "support") ? s : null;
}
const NO = "Sign in with a real account to use support.";

export async function listTickets(): Promise<Result<TicketDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const mine = STAFF.includes(s.role) ? undefined : eq(supportTickets.userId, s.uid);
  const rows = await db().select({ t: supportTickets, u: users }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
    .where(and(eq(supportTickets.organizationId, s.org), mine)).orderBy(desc(supportTickets.createdAt)).limit(200);
  return { ok: true, data: rows.map(({ t, u }) => ({ id: t.id, who: u.name, subject: t.subject, body: t.body, status: t.status, at: t.createdAt.toISOString() })) };
}

const newIn = z.object({ subject: z.string().trim().min(3, "Add a short subject").max(160), body: z.string().trim().min(5, "Describe the issue").max(2000) });
export async function createTicket(input: z.infer<typeof newIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = newIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const id = crypto.randomUUID();
  await db().insert(supportTickets).values({ id, organizationId: s.org, userId: s.uid, subject: p.data.subject, body: p.data.body });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "ticket.create", entity: "ticket", entityId: id });
  return { ok: true, data: null };
}

export async function closeTicket(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return { ok: false, error: NO };
  const [t] = await db().select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.organizationId, s.org)));
  if (!t) return { ok: false, error: "Ticket not found" };
  // Staff can close any ticket; a member can close their own.
  if (!STAFF.includes(s.role) && t.userId !== s.uid) return { ok: false, error: "You can't close this ticket" };
  await db().update(supportTickets).set({ status: "closed", closedAt: new Date() }).where(eq(supportTickets.id, id));
  return { ok: true, data: null };
}
