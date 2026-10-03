"use server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

const { communityPosts, communityComments, communityLikes, users, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type PostDTO = { id: string; kind: string; body: string; author: string; authorTitle: string; at: string; likes: number; liked: boolean; comments: number; mine: boolean };
export type CommentDTO = { id: string; author: string; body: string; at: string };
export type PersonDTO = { id: string; name: string; company: string; jobTitle: string };

const MODS = ["super_admin", "owner", "location_manager", "community_manager"];
const KINDS = ["update", "opportunity", "job", "question", "announcement"] as const;
const NO = "Sign in with a real account to use the community.";

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && can(s.role, "community") ? s : null;
}

export async function listPosts(): Promise<Result<PostDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const posts = await db().select({ p: communityPosts, u: users }).from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorId))
    .where(and(eq(communityPosts.organizationId, s.org), isNull(communityPosts.deletedAt)))
    .orderBy(sql`${communityPosts.kind} = 'announcement' desc`, desc(communityPosts.createdAt)).limit(100);
  if (!posts.length) return { ok: true, data: [] };
  const ids = posts.map((x) => x.p.id);
  const likes = await db().select({ postId: communityLikes.postId, n: sql<number>`count(*)`, mine: sql<number>`sum(${communityLikes.userId} = ${s.uid})` }).from(communityLikes).where(inArray(communityLikes.postId, ids)).groupBy(communityLikes.postId);
  const cmts = await db().select({ postId: communityComments.postId, n: sql<number>`count(*)` }).from(communityComments).where(inArray(communityComments.postId, ids)).groupBy(communityComments.postId);
  return { ok: true, data: posts.map(({ p, u }) => {
    const l = likes.find((x) => x.postId === p.id);
    return { id: p.id, kind: p.kind, body: p.body, author: u.name, authorTitle: [u.jobTitle, u.company].filter(Boolean).join(" · "), at: p.createdAt.toISOString(),
      likes: Number(l?.n ?? 0), liked: Number(l?.mine ?? 0) > 0, comments: Number(cmts.find((x) => x.postId === p.id)?.n ?? 0), mine: p.authorId === s.uid };
  }) };
}

const postIn = z.object({ kind: z.enum(KINDS), body: z.string().trim().min(2, "Write something first").max(2000) });
export async function createPost(input: z.infer<typeof postIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = postIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.kind === "announcement" && !MODS.includes(s.role)) return { ok: false, error: "Only the community team can post announcements." };
  const id = crypto.randomUUID();
  await db().insert(communityPosts).values({ id, organizationId: s.org, authorId: s.uid, kind: p.data.kind, body: p.data.body });
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "post.create", entity: "post", entityId: id });
  return { ok: true, data: null };
}

async function visiblePost(org: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [p] = await db().select().from(communityPosts).where(and(eq(communityPosts.id, id), eq(communityPosts.organizationId, org), isNull(communityPosts.deletedAt)));
  return p ?? null;
}

export async function toggleLike(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const post = await visiblePost(s.org, id);
  if (!post) return { ok: false, error: "Post not found" };
  const del = await db().delete(communityLikes).where(and(eq(communityLikes.postId, id), eq(communityLikes.userId, s.uid)));
  if (!(del[0] as { affectedRows?: number }).affectedRows) {
    await db().insert(communityLikes).values({ postId: id, userId: s.uid }).onDuplicateKeyUpdate({ set: { userId: s.uid } });
  }
  return { ok: true, data: null };
}

export async function listComments(id: string): Promise<Result<CommentDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  if (!(await visiblePost(s.org, id))) return { ok: false, error: "Post not found" };
  const rows = await db().select({ c: communityComments, u: users }).from(communityComments).innerJoin(users, eq(users.id, communityComments.authorId))
    .where(eq(communityComments.postId, id)).orderBy(asc(communityComments.createdAt)).limit(200);
  return { ok: true, data: rows.map(({ c, u }) => ({ id: c.id, author: u.name, body: c.body, at: c.createdAt.toISOString() })) };
}

export async function addComment(id: string, body: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const b = z.string().trim().min(1, "Write a comment").max(1000).safeParse(body);
  if (!b.success) return { ok: false, error: b.error.issues[0].message };
  if (!(await visiblePost(s.org, id))) return { ok: false, error: "Post not found" };
  await db().insert(communityComments).values({ postId: id, authorId: s.uid, body: b.data });
  return { ok: true, data: null };
}

export async function deletePost(id: string): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = await visiblePost(s.org, id);
  if (!p) return { ok: false, error: "Post not found" };
  if (p.authorId !== s.uid && !MODS.includes(s.role)) return { ok: false, error: "You can only delete your own posts." };
  await db().update(communityPosts).set({ deletedAt: new Date() }).where(eq(communityPosts.id, id));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "post.delete", entity: "post", entityId: id });
  return { ok: true, data: null };
}

/** Directory shows only name, company and job title. Never email or phone. */
export async function listDirectory(): Promise<Result<PersonDTO[]>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const rows = await db().select({ id: users.id, name: users.name, company: users.company, jobTitle: users.jobTitle }).from(users)
    .where(and(eq(users.organizationId, s.org), isNull(users.deletedAt))).orderBy(users.name).limit(500);
  return { ok: true, data: rows.map((r) => ({ id: r.id, name: r.name, company: r.company ?? "", jobTitle: r.jobTitle ?? "" })) };
}
