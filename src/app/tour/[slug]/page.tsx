import type { Metadata } from "next";
import { loadTourPage } from "../actions";
import { TourForm } from "./tour-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a tour", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await loadTourPage(slug);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Nexpreneur" width={150} height={36} className="h-auto w-36" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        {r.ok ? <TourForm slug={slug} data={r.data} /> : (
          <div className="rounded-2xl border bg-surface p-8 text-center"><h1 className="text-xl font-semibold">Tour booking isn&apos;t available</h1><p className="mt-2 text-muted">{r.error} Please contact us directly.</p></div>
        )}
      </main>
    </div>
  );
}
