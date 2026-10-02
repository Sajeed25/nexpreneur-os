import { notFound } from "next/navigation";
import { NAV } from "@/components/shell/nav";
import { ComingSoon } from "@/components/ui";
import { requireSection } from "@/lib/guard";

const PHASE: Record<string, string> = {
  bookings: "Phase 3", calendar: "Phase 3", memberships: "Phase 4", payments: "Phase 4", invoices: "Phase 4",
  visitors: "Phase 6", crm: "Phase 6", events: "Phase 6", community: "Phase 6", analytics: "Phase 7", ai: "Phase 8",
};

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = NAV.find((n) => n.section === section);
  if (!item) notFound();
  await requireSection(item.section);
  return <ComingSoon title={item.label} phase={PHASE[section]} />;
}
