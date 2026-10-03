import { requireSection } from "@/lib/guard";
import { CompaniesApp } from "./companies-app";

export default async function Page() {
  await requireSection("companies");
  return <CompaniesApp />;
}
