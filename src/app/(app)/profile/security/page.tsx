import { requireSection } from "@/lib/guard";
import { SecurityApp } from "./security-app";

export default async function Page() {
  await requireSection("profile");
  return <SecurityApp />;
}
