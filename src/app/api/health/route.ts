import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const CHECKS: Record<string, () => Promise<unknown>> = {
  mysql2: () => import("mysql2/promise"),
  drizzle: () => import("drizzle-orm/mysql2"),
  bcryptjs: () => import("bcryptjs"),
  jose: () => import("jose"),
  authService: () => import("@/lib/auth-service"),
};

/** GET /api/health is a public ping. ?deep=1 (library + config diagnostics) is for signed-in owners only. */
export async function GET(req: Request) {
  const base = { ok: true, service: "nexpreneur-os" };
  if (new URL(req.url).searchParams.get("deep") !== "1") return Response.json(base);
  const s = await getSession();
  if (!s || (s.role !== "owner" && s.role !== "super_admin")) return Response.json(base);
  const modules: Record<string, string> = {};
  for (const [k, load] of Object.entries(CHECKS)) {
    try { await load(); modules[k] = "ok"; }
    catch (e) { modules[k] = `FAIL: ${String((e as Error)?.message ?? e).slice(0, 200)}`; }
  }
  return Response.json({
    ...base, node: process.version, modules,
    env: {
      DATABASE_URL: /^mysql:\/\//.test(process.env.DATABASE_URL ?? "") ? "mysql url set" : "not a mysql url",
      AUTH_SECRET_len_ok: (process.env.AUTH_SECRET ?? "").length >= 16,
      OPENAI: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "placeholder",
      RAZORPAY: !!process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== "placeholder",
    },
  });
}
