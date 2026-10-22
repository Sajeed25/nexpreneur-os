import { requireSection } from "@/lib/guard";
import { CreditNoteView } from "./credit-note-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("invoices");
  const { id } = await params;
  return <CreditNoteView id={id} />;
}
