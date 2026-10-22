import { requireSection } from "@/lib/guard";
import { PaymentsApp } from "./payments-app";

export default async function Page() {
  const s = await requireSection("payments");
  return <PaymentsApp viewerId={s.uid} />;
}
