import { requireSection } from "@/lib/guard";
import { isFinance, isManager } from "@/lib/billing";
import { InvoiceView } from "./invoice-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSection("invoices");
  const { id } = await params;
  return <InvoiceView id={id} finance={isFinance(s.role)} manager={isManager(s.role) || s.role === "finance"} />;
}
