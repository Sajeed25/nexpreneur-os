import { requireSection } from "@/lib/guard";
import { NotificationsApp } from "./notifications-app";

export default async function Page() {
  const s = await requireSection("notifications");
  return <NotificationsApp canAnnounce={["super_admin", "owner", "location_manager", "community_manager"].includes(s.role)} />;
}
