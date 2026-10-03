import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell, type LocOption } from "@/components/shell/app-shell";
import { hasDb } from "@/lib/db/config";
import { LOCATIONS } from "@/lib/demo-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");

  let places: LocOption[] = LOCATIONS.filter((l) => l.id !== "all").map((l) => ({ id: l.id, name: l.name })); // demo mode
  if (!s.demo && hasDb()) {
    try {
      const { db, schema } = await import("@/lib/db");
      const { and, asc, eq, isNull } = await import("drizzle-orm");
      places = await db().select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations)
        .where(and(eq(schema.locations.organizationId, s.org), isNull(schema.locations.deletedAt))).orderBy(asc(schema.locations.createdAt));
    } catch (e) {
      console.error("location list failed", e);
      places = [];
    }
  }
  return <AppShell user={{ name: s.name, role: s.role }} locations={places}>{children}</AppShell>;
}
