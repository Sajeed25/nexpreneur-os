export const dynamic = "force-dynamic";

const CHECKS: Record<string, () => Promise<unknown>> = {
  mysql2: () => import("mysql2/promise"),
  drizzle: () => import("drizzle-orm/mysql2"),
  bcryptjs: () => import("bcryptjs"),
  jose: () => import("jose"),
  authService: () => import("@/lib/auth-service"),
};

/** GET /api/health for a simple ping; /api/health?deep=1 reports which libraries fail to load on this host. */
export async function GET(req: Request) {
  const base = { ok: true, service: "nexpreneur-os", node: process.version };
  if (new URL(req.url).searchParams.get("deep") !== "1") return Response.json(base);
  const modules: Record<string, string> = {};
  for (const [k, load] of Object.entries(CHECKS)) {
    try { await load(); modules[k] = "ok"; }
    catch (e) { modules[k] = `FAIL: ${String((e as Error)?.message ?? e).slice(0, 200)}`; }
  }
  return Response.json({
    ...base, modules,
    env: { DATABASE_URL: /^mysql:\/\//.test(process.env.DATABASE_URL ?? "") ? "mysql url set" : "not a mysql url", AUTH_SECRET_len_ok: (process.env.AUTH_SECRET ?? "").length >= 16 },
  });
}
