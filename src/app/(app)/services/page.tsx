import { requireSection } from "@/lib/guard";
import { isManager } from "@/lib/billing";
import { ServicesApp } from "./services-app";

export default async function Page() {
  const s = await requireSection("services");
  return <ServicesApp manage={isManager(s.role)} />;
}
