"use server";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/images";

const EDITORS = ["super_admin", "owner", "location_manager", "community_manager"];
export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/** Stores an image in the database and returns its id. Event and service managers only. Served by /api/images/<id>. */
export async function uploadImage(fd: FormData): Promise<UploadResult> {
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !EDITORS.includes(s.role)) return { ok: false, error: "You don't have permission to upload images." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image first." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "That image is too large (max 900 KB)." };
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(data);
  if (!mime) return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  const id = crypto.randomUUID();
  await db().insert(schema.images).values({ id, organizationId: s.org, mime, data });
  return { ok: true, id };
}
