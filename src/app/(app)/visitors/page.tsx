import { requireSection } from "@/lib/guard";
import { VisitorsApp } from "./visitors-app";

export default async function Page() {
  const s = await requireSection("visitors");
  return <VisitorsApp desk={["super_admin", "owner", "location_manager", "reception", "staff"].includes(s.role)} />;
}
