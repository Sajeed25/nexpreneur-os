import { requireSection } from "@/lib/guard";
import { CommunityApp } from "./community-app";

export default async function Page() {
  const s = await requireSection("community");
  return <CommunityApp mod={["super_admin", "owner", "location_manager", "community_manager"].includes(s.role)} />;
}
