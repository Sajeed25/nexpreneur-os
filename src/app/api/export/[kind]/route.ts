import { hasDb } from "@/lib/db/config";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isFinance } from "@/lib/billing";
import { todayIST } from "@/lib/booking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = {
  tally: { type: "application/xml; charset=utf-8", ext: "xml" },
  zoho: { type: "text/csv; charset=utf-8", ext: "csv" },
  gst: { type: "text/csv; charset=utf-8", ext: "csv" },
  payments: { type: "text/csv; charset=utf-8", ext: "csv" },
} as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accounting downloads for finance: /api/export/<tally|zoho|gst|payments>?from=YYYY-MM-DD&to=YYYY-MM-DD[&location=<id>] (default: this month). */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const s = await getSession();
  if (!s || s.demo || !hasDb() || !can(s.role, "invoices") || !isFinance(s.role)) return new Response("Not found", { status: 404 });
  if (!(kind in KINDS)) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const today = todayIST();
  const from = sp.get("from") ?? `${today.slice(0, 8)}01`, to = sp.get("to") ?? today;
  if (!DATE.test(from) || !DATE.test(to) || from > to) return new Response("Pick a valid date range.", { status: 400 });
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 400) return new Response("Pick a range of up to 13 months.", { status: 400 });
  const loc = sp.get("location");
  const locationId = loc && /^[0-9a-f-]{36}$/.test(loc) ? loc : null;

  const { loadExportData } = await import("@/lib/exports");
  const x = await import("@/lib/exports-math");
  const data = await loadExportData(s.org, from, to, locationId);
  const body = kind === "tally" ? x.tallyXml(data) : kind === "zoho" ? x.zohoCsv(data.sales) : kind === "gst" ? x.gstRegisterCsv(data.sales, data.creditNotes) : x.paymentsCsv(data.payments);
  const { db, schema } = await import("@/lib/db");
  await db().insert(schema.auditLogs).values({ organizationId: s.org, actorId: s.uid, action: `export.${kind}:${from}..${to}`, entity: "organization", entityId: s.org });
  const k = KINDS[kind as keyof typeof KINDS];
  return new Response(body, { headers: { "Content-Type": k.type, "Content-Disposition": `attachment; filename="nexpreneur-${kind}-${from}-to-${to}.${k.ext}"`, "Cache-Control": "private, no-store" } });
}
