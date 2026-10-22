import { requireSection } from "@/lib/guard";
import { IdCard } from "./id-card";

export default async function Page() {
  await requireSection("profile");
  return <IdCard />;
}
