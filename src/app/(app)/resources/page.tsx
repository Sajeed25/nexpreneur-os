import { requireSection } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { ResourcesTable } from "./resources-table";

export default async function Page() {
  await requireSection("resources");
  return (
    <>
      <PageHeader title="Resources" sub="Desks, rooms, offices and spaces." />
      <ResourcesTable />
    </>
  );
}
