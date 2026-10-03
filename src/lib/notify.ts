import "server-only";
import { db, schema } from "@/lib/db";
import type { Tx } from "@/lib/payments-server";

export type NotifyKind = "booking" | "invoice" | "payment" | "refund" | "renewal" | "reminder" | "event" | "visitor" | "support" | "announcement" | "service";
type Exec = ReturnType<typeof db> | Tx;

/** Adds an in-app notification. Never throws: a failed notification must not undo the action that caused it. */
export async function notify(exec: Exec, n: { org: string; userId: string; kind: NotifyKind; title: string; body?: string; link?: string }) {
  try {
    await exec.insert(schema.notifications).values({ organizationId: n.org, userId: n.userId, kind: n.kind, title: n.title.slice(0, 160), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null });
  } catch (e) {
    console.error("notify failed", e);
  }
}
