import { requireSection } from "@/lib/guard";
import { Dashboard } from "./dashboard";
import { MemberHome } from "./member-home";

export default async function Page() {
  const s = await requireSection("dashboard");
  const first = s.name.split(" ")[0];
  return s.role === "member" ? <MemberHome name={first} /> : <Dashboard name={first} />;
}
