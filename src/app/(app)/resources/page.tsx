import { requireSection } from "@/lib/guard";
import { ResourcesApp } from "./resources-app";

export default async function Page() {
  await requireSection("resources");
  return <ResourcesApp />;
}
