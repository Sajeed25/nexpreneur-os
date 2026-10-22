import { requireSection } from "@/lib/guard";
import { MarketplaceApp } from "./marketplace-app";

export default async function Page() {
  await requireSection("marketplace");
  return <MarketplaceApp />;
}
