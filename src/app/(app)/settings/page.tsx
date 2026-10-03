import { requireSection } from "@/lib/guard";
import { SettingsApp } from "./settings-app";

export default async function Page() {
  const s = await requireSection("settings");
  return <SettingsApp canGrantSuper={s.role === "super_admin"} />;
}
