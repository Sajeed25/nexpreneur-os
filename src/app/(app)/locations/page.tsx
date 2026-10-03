import { requireSection } from "@/lib/guard";
import { LocationsApp } from "./locations-app";

export default async function Page() {
  await requireSection("locations");
  return <LocationsApp />;
}
