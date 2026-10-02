import { requireSection } from "@/lib/guard";
import { BookingsApp } from "../bookings/bookings-app";

export default async function Page() {
  const s = await requireSection("calendar");
  return <BookingsApp initialTab="calendar" canSeed={["super_admin", "owner", "location_manager"].includes(s.role)} />;
}
