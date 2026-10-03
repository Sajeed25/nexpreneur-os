import { requireSection } from "@/lib/guard";
import { EventsApp } from "./events-app";

export default async function Page() {
  const s = await requireSection("events");
  return <EventsApp manage={["super_admin", "owner", "location_manager", "community_manager"].includes(s.role)} />;
}
