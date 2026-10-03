import { requireSection } from "@/lib/guard";
import { SupportApp } from "./support-app";

export default async function Page() {
  const s = await requireSection("support");
  return <SupportApp staff={["super_admin", "owner", "location_manager", "reception"].includes(s.role)} />;
}
