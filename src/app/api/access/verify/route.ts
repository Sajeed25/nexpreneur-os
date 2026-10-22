import { hasDb } from "@/lib/db/config";

export const dynamic = "force-dynamic";

/**
 * Door controller -> us. POST { "credential": "<what the reader scanned>" } with the header  X-Door-Key: <the door's key>.
 * The credential is a member's pass QR (NX1....), a visitor's code, or "rfid:<card id>".
 * Answers { allow, reason, name? }. The controller opens the door when allow is true. Every attempt is logged.
 */
export async function POST(req: Request) {
  if (!hasDb()) return Response.json({ allow: false, reason: "Not configured" }, { status: 503 });
  let credential = "";
  try {
    const j = (await req.json()) as { credential?: unknown };
    credential = typeof j.credential === "string" ? j.credential.slice(0, 200) : "";
  } catch {
    return Response.json({ allow: false, reason: "Bad request" }, { status: 400 });
  }
  const key = req.headers.get("x-door-key");
  try {
    const { verifyAtDoor } = await import("@/lib/access");
    const r = await verifyAtDoor(key && key.length < 100 ? key : null, credential);
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("door verify failed", e);
    return Response.json({ allow: false, reason: "Server error" }, { status: 500 }); // fail closed
  }
}
