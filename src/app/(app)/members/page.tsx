import { requireSection } from "@/lib/guard";
import { MembersApp } from "./members-app";

export default async function Page() {
  await requireSection("members");
  return <MembersApp />;
}
