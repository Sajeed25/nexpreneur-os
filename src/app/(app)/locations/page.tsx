import { requireSection } from "@/lib/guard";
import { Card, PageHeader } from "@/components/ui";
import { LOCATIONS, MEMBERS, RESOURCES } from "@/lib/demo-data";

export default async function Page() {
  await requireSection("locations");
  return (
    <>
      <PageHeader title="Locations" sub="Every Nexpreneur space at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOCATIONS.filter((l) => l.id !== "all").map((l) => (
          <Card key={l.id}>
            <h2 className="text-lg font-semibold">Nexpreneur {l.name}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Members</dt><dd className="text-xl font-semibold">{MEMBERS.filter((m) => m.location === l.id).length}</dd></div>
              <div><dt className="text-muted">Resources</dt><dd className="text-xl font-semibold">{RESOURCES.filter((r) => r.location === l.id).length}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
