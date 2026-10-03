import { and, eq } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Serves an uploaded image to signed-in people of the same organisation. Only allow-listed image types are ever stored. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [img] = await db().select().from(schema.images).where(and(eq(schema.images.id, id), eq(schema.images.organizationId, s.org)));
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
