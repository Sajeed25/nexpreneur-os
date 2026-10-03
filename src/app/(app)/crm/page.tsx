import { requireSection } from "@/lib/guard";
import { CrmApp } from "./crm-app";

export default async function Page() {
  await requireSection("crm");
  return <CrmApp />;
}
