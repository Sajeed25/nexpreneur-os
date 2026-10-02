import { requireSection } from "@/lib/guard";
import { isFinance } from "@/lib/billing";
import { InvoicesApp } from "./invoices-app";

export default async function Page() {
  const s = await requireSection("invoices");
  return <InvoicesApp canCreate={isFinance(s.role)} />;
}
