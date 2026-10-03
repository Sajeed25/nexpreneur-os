import { requireSection } from "@/lib/guard";
import { MemberView } from "./member-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("members");
  const { id } = await params;
  return <MemberView id={id} />;
}
