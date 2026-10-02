import { Suspense } from "react";
import { requireSection } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { BookFlow } from "./book-flow";

export default async function Page() {
  await requireSection("bookings");
  return (
    <>
      <PageHeader title="Book a space" sub="Pick a type, a time, and a space." />
      <Suspense><BookFlow /></Suspense>
    </>
  );
}
