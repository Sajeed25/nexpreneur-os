"use server";
import bcrypt from "bcryptjs";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { smtpConfigured, appUrl } from "@/lib/mailer";
import { assignMembership } from "../invoices/actions";

const { users, memberships, membershipPlans, invoices, bookings, resources, locations, companies, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account to manage members.";
const FORBIDDEN = "You don't have permission to do that.";
// Who may onboard and edit members. Community managers can see the list but not change it.
const EDITORS = ["super_admin", "owner", "location_manager", "reception"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "members") ? s : null;
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const dupCode = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

export type MemberRow = {
  id: string; name: string; email: string; phone: string; company: string; jobTitle: string;
  locationId: string | null; locationName: string; plan: string | null; planStatus: string | null; renewalDate: string | null;
  owedPaise: number; active: boolean; lastLoginAt: string | null; joinedAt: string;
};
export type MemberOptions = {
  canEdit: boolean; canAssign: boolean; emailReady: boolean;
  locations: { id: string; name: string }[]; plans: { id: string; name: string; pricePaise: number }[]; companies: { id: string; name: string }[];
};

export async function memberOptions(): Promise<Result<MemberOptions>> {
  const s = await ctx();
  if (!s) return fail(NO);
  const [locs, plans, cos] = await Promise.all([
    db().select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.organizationId, s.org), isNull(locations.deletedAt))).orderBy(locations.createdAt),
    db().select({ id: membershipPlans.id, name: membershipPlans.name, pricePaise: membershipPlans.pricePaise }).from(membershipPlans).where(and(eq(membershipPlans.organizationId, s.org), isNull(membershipPlans.deletedAt))).orderBy(membershipPlans.pricePaise),
    db().select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.organizationId, s.org), isNull(companies.deletedAt))).orderBy(companies.name),
  ]);
  return { ok: true, data: { canEdit: EDITORS.includes(s.role), canAssign: isFinance(s.role), emailReady: smtpConfigured() && !!appUrl(), locations: locs, plans, companies: cos } };
}

export async function listMembers(): Promise<Result<MemberRow[]>> {
  const s = await ctx();
  if (!s) return fail(NO);
  const d = db();
  const people = await d.select().from(users).where(and(eq(users.organizationId, s.org), eq(users.role, "member"))).orderBy(users.name).limit(2000);
  if (!people.length) return { ok: true, data: [] };
  const ids = people.map((p) => p.id);
  const [locs, ms, owed, cos] = await Promise.all([
    d.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.organizationId, s.org)),
    d.select({ userId: memberships.userId, status: memberships.status, renewal: memberships.renewalDate, plan: membershipPlans.name, created: memberships.createdAt }).from(memberships)
      .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId)).where(and(eq(memberships.organizationId, s.org), inArray(memberships.userId, ids))).orderBy(desc(memberships.createdAt)),
    isFinance(s.role)
      ? d.select({ userId: invoices.userId, v: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)` }).from(invoices)
          .where(and(eq(invoices.organizationId, s.org), inArray(invoices.status, ["unpaid", "partial"]), inArray(invoices.userId, ids))).groupBy(invoices.userId)
      : Promise.resolve([]),
    d.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.organizationId, s.org)),
  ]);
  return { ok: true, data: people.map((p) => {
    // The "current" membership: an active or paused one if there is one, otherwise the latest.
    const mine = ms.filter((m) => m.userId === p.id);
    const cur = mine.find((m) => m.status === "active") ?? mine.find((m) => m.status === "paused") ?? mine[0];
    return {
      id: p.id, name: p.name, email: p.email, phone: p.phone ?? "", jobTitle: p.jobTitle ?? "",
      company: cos.find((c) => c.id === p.companyId)?.name ?? p.company ?? "",
      locationId: p.locationId, locationName: locs.find((l) => l.id === p.locationId)?.name ?? "",
      plan: cur?.plan ?? null, planStatus: cur?.status ?? null, renewalDate: cur?.status === "active" ? cur.renewal : null,
      owedPaise: Number(owed.find((o) => o.userId === p.id)?.v ?? 0), active: !p.deletedAt,
      lastLoginAt: p.lastLoginAt?.toISOString() ?? null, joinedAt: p.createdAt.toISOString(),
    };
  }) };
}

const phone = z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )");
const details = {
  name: z.string().trim().min(2, "Enter the member's name").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(190),
  phone, jobTitle: z.string().trim().max(120), company: z.string().trim().max(160),
  companyId: z.string().uuid().optional().or(z.literal("")), locationId: z.string().uuid().optional().or(z.literal("")),
};

/** A location or company id must belong to this organisation; anything else is dropped rather than trusted. */
async function ownedIds(org: string, locationId?: string, companyId?: string) {
  const [l] = locationId ? await db().select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.organizationId, org), isNull(locations.deletedAt))) : [];
  const [c] = companyId ? await db().select({ id: companies.id }).from(companies).where(and(eq(companies.id, companyId), eq(companies.organizationId, org), isNull(companies.deletedAt))) : [];
  return { locationId: l?.id ?? null, companyId: c?.id ?? null };
}

const addIn = z.object({
  ...details,
  access: z.enum(["invite", "password"]), password: z.string().max(72).optional(),
  planId: z.string().uuid().optional().or(z.literal("")), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), couponCode: z.string().trim().max(40).optional(),
});
export type AddMemberResult = { id: string; invited: boolean; note: string; invoiceId: string | null };

export async function addMember(input: z.infer<typeof addIn>): Promise<Result<AddMemberResult>> {
  const s = await ctx();
  if (!s) return fail(NO);
  if (!EDITORS.includes(s.role)) return fail(FORBIDDEN);
  const p = addIn.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const v = p.data;
  const emailReady = smtpConfigured() && !!appUrl();
  let password: string;
  if (v.access === "password") {
    if (!v.password || v.password.length < 8) return fail("The temporary password must be at least 8 characters.");
    password = v.password;
  } else {
    if (!emailReady) return fail("Email isn't set up yet, so we can't send the invitation. Choose \"Set a temporary password\" instead.");
    password = crypto.randomUUID() + crypto.randomUUID(); // unusable until they choose their own via the emailed link
  }
  const own = await ownedIds(s.org, v.locationId || undefined, v.companyId || undefined);
  const id = crypto.randomUUID();
  try {
    await db().insert(users).values({
      id, organizationId: s.org, name: v.name, email: v.email, passwordHash: await bcrypt.hash(password, 11), role: "member",
      phone: v.phone || null, jobTitle: v.jobTitle || null, company: v.company || null, companyId: own.companyId, locationId: own.locationId,
    });
  } catch (e) {
    return fail(dupCode(e) === "ER_DUP_ENTRY" ? "Someone with that email already has an account." : "Couldn't add the member. Please try again.");
  }
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "member.add", entity: "user", entityId: id });

  let invited = false, note = "";
  if (v.access === "invite") {
    invited = await (await import("@/lib/auth-service")).sendWelcome(id);
    if (!invited) note = "The member was added, but the invitation email couldn't be sent. Use \"Send invitation\" on their page to try again.";
  }
  let invoiceId: string | null = null;
  if (v.planId) {
    if (!isFinance(s.role)) note = (note ? note + " " : "") + "The plan wasn't assigned: only finance and managers can start a plan.";
    else {
      const r = await assignMembership({ userId: id, planId: v.planId, startDate: v.startDate ?? new Date().toISOString().slice(0, 10), locationId: own.locationId ?? undefined, couponCode: v.couponCode || undefined, email: true });
      if (r.ok) invoiceId = r.data.invoiceId; else note = (note ? note + " " : "") + `The member was added, but the plan wasn't started: ${r.error}`;
    }
  }
  return { ok: true, data: { id, invited, note, invoiceId } };
}

export async function updateMember(id: string, input: z.infer<z.ZodObject<typeof details>>): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!EDITORS.includes(s.role)) return fail(FORBIDDEN);
  const p = z.object(details).safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const v = p.data;
  const [m] = await db().select().from(users).where(and(eq(users.id, id), eq(users.organizationId, s.org), eq(users.role, "member")));
  if (!m) return fail("Member not found");
  const own = await ownedIds(s.org, v.locationId || undefined, v.companyId || undefined);
  try {
    await db().update(users).set({ name: v.name, email: v.email, phone: v.phone || null, jobTitle: v.jobTitle || null, company: v.company || null, companyId: own.companyId, locationId: own.locationId }).where(eq(users.id, id));
  } catch (e) {
    return fail(dupCode(e) === "ER_DUP_ENTRY" ? "Another account already uses that email." : "Couldn't save the changes.");
  }
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: m.email !== v.email ? "member.update+email" : "member.update", entity: "user", entityId: id });
  return { ok: true, data: null };
}

export async function setMemberActive(id: string, active: boolean): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!EDITORS.includes(s.role)) return fail(FORBIDDEN);
  const r = await db().update(users).set({ deletedAt: active ? null : new Date() }).where(and(eq(users.id, id), eq(users.organizationId, s.org), eq(users.role, "member")));
  if (!(r[0] as { affectedRows?: number }).affectedRows) return fail("Member not found");
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: active ? "member.reactivate" : "member.deactivate", entity: "user", entityId: id });
  return { ok: true, data: null };
}

/** Emails the member a fresh "set your password" link. Also used to re-send an invitation. */
export async function sendInvitation(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!EDITORS.includes(s.role)) return fail(FORBIDDEN);
  if (!(smtpConfigured() && appUrl())) return fail("Email isn't set up yet. Set a temporary password instead.");
  const [m] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.organizationId, s.org), eq(users.role, "member"), isNull(users.deletedAt)));
  if (!m) return fail("Member not found, or the account is deactivated.");
  const ok = await (await import("@/lib/auth-service")).sendWelcome(id);
  if (!ok) return fail("Couldn't send the email. Please try again.");
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "member.invite_sent", entity: "user", entityId: id });
  return { ok: true, data: null };
}

/** Sets a new temporary password and signs the member out everywhere. */
export async function setTemporaryPassword(id: string, password: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Invalid request" : NO);
  if (!EDITORS.includes(s.role)) return fail(FORBIDDEN);
  if (typeof password !== "string" || password.length < 8 || password.length > 72) return fail("The password must be 8 to 72 characters.");
  const r = await db().update(users).set({ passwordHash: await bcrypt.hash(password, 11), passwordChangedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.organizationId, s.org), eq(users.role, "member")));
  if (!(r[0] as { affectedRows?: number }).affectedRows) return fail("Member not found");
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "member.password_set", entity: "user", entityId: id });
  return { ok: true, data: null };
}

// ---------- One member's page ----------
export type MemberDetail = {
  member: MemberRow & { companyId: string | null };
  memberships: { id: string; plan: string; start: string; renewal: string; status: string }[];
  bookings: { id: string; space: string; startsAt: string; endsAt: string; status: string; totalPaise: number }[];
  invoices: { id: string; number: string; issueDate: string; totalPaise: number; paidPaise: number; status: string }[];
  activity: { id: string; action: string; at: string }[];
};

export async function getMember(id: string): Promise<Result<MemberDetail>> {
  const s = await ctx();
  if (!s || !z.string().uuid().safeParse(id).success) return fail(s ? "Member not found" : NO);
  const list = await listMembers();
  if (!list.ok) return list;
  const row = list.data.find((m) => m.id === id);
  const [u] = await db().select({ companyId: users.companyId }).from(users).where(and(eq(users.id, id), eq(users.organizationId, s.org)));
  if (!row || !u) return fail("Member not found");
  const d = db();
  const [ms, bks, inv, acts] = await Promise.all([
    d.select({ id: memberships.id, plan: membershipPlans.name, start: memberships.startDate, renewal: memberships.renewalDate, status: memberships.status }).from(memberships)
      .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId)).where(and(eq(memberships.userId, id), eq(memberships.organizationId, s.org))).orderBy(desc(memberships.createdAt)).limit(20),
    d.select({ id: bookings.id, space: resources.name, startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status, total: bookings.totalPaise }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).where(and(eq(bookings.userId, id), eq(bookings.organizationId, s.org))).orderBy(desc(bookings.startsAt)).limit(15),
    isFinance(s.role)
      ? d.select().from(invoices).where(and(eq(invoices.userId, id), eq(invoices.organizationId, s.org))).orderBy(desc(invoices.issueDate)).limit(15)
      : Promise.resolve([]),
    d.select().from(auditLogs).where(and(eq(auditLogs.organizationId, s.org), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt)).limit(15),
  ]);
  return { ok: true, data: {
    member: { ...row, companyId: u.companyId },
    memberships: ms,
    bookings: bks.map((b) => ({ id: b.id, space: b.space, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), status: b.status, totalPaise: b.total })),
    invoices: inv.map((i) => ({ id: i.id, number: i.number, issueDate: i.issueDate, totalPaise: i.totalPaise, paidPaise: i.paidPaise, status: i.status })),
    activity: acts.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString() })),
  } };
}
