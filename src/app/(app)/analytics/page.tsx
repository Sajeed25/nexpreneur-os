import { requireSection } from "@/lib/guard";
import { AnalyticsApp } from "./analytics-app";

export default async function Page() {
  await requireSection("analytics");
  return <AnalyticsApp />;
}
