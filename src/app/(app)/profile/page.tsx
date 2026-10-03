import { requireSection } from "@/lib/guard";
import { ProfileApp } from "./profile-app";

export default async function Page() {
  await requireSection("profile");
  return <ProfileApp />;
}
