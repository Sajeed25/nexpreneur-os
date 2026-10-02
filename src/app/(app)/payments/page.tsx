import { requireSection } from "@/lib/guard";
import { PaymentsApp } from "./payments-app";

export default async function Page() {
  await requireSection("payments");
  return <PaymentsApp />;
}
