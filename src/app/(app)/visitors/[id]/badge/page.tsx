import { requireSection } from "@/lib/guard";
import { BadgeView } from "./badge-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("visitors");
  const { id } = await params;
  return <BadgeView id={id} />;
}
