import type { Metadata } from "next";
import { getTourByToken } from "../actions";
import { CancelView } from "./cancel-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your tour", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const r = await getTourByToken(token);
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-5">
      <div className="w-full max-w-md rounded-2xl border bg-surface p-6 text-center">
        {r.ok ? <CancelView token={token} tour={r.data} /> : <><h1 className="text-xl font-semibold">We couldn&apos;t find that tour</h1><p className="mt-2 text-muted">{r.error}</p></>}
      </div>
    </div>
  );
}
