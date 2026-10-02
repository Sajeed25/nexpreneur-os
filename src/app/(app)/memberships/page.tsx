import { requireSection } from "@/lib/guard";
import { isFinance, isManager } from "@/lib/billing";
import { MembershipsApp } from "./memberships-app";

export default async function Page() {
  const s = await requireSection("memberships");
  return <MembershipsApp canAssign={isFinance(s.role)} canCreatePlan={isManager(s.role)} />;
}
