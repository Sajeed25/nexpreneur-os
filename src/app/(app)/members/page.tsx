import { requireSection } from "@/lib/guard";
import { MembersTable } from "./members-table";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  await requireSection("members");
  return (
    <>
      <PageHeader title="Members" sub="Everyone across your coworking locations." />
      <MembersTable />
    </>
  );
}
