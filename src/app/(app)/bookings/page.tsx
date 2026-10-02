import { requireSection } from "@/lib/guard";
import { BookingsApp } from "./bookings-app";

export default async function Page() {
  const s = await requireSection("bookings");
  return <BookingsApp initialTab="list" canSeed={["super_admin", "owner", "location_manager"].includes(s.role)} />;
}
