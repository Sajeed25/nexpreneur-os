"use client";
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getMyPass, type PassDTO } from "./pass";

/** Fetches a fresh pass just before the current one runs out, so what's on screen always works at the door. */
export function usePass() {
  const [pass, setPass] = React.useState<PassDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await getMyPass();
        if (!live) return;
        if (r.ok) { setPass(r.data); setError(null); timer = setTimeout(load, Math.max(5_000, r.data.refreshInMs - 3_000)); }
        else setError(r.error);
      } catch { if (live) { setError("Couldn't load your pass."); timer = setTimeout(load, 15_000); } }
    };
    load();
    return () => { live = false; clearTimeout(timer); };
  }, []);
  return { pass, error };
}

export function PassCard() {
  const { pass, error } = usePass();
  return (
    <Card className="flex flex-wrap items-center gap-5">
      <div className="grid size-40 shrink-0 place-items-center rounded-xl border bg-white p-2">
        {pass ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={pass.dataUrl} alt="Your door pass QR code" width={144} height={144} /> : <span className="text-sm text-muted">{error ?? "…"}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-medium">Your access pass</h2>
        <p className="text-sm text-muted">Hold this up to the reader at the door. It changes every minute, so a screenshot won&apos;t work for anyone else.</p>
        <Link href="/profile/id-card" className="inline-block text-sm font-medium text-accent hover:underline">Open my ID card</Link>
      </div>
    </Card>
  );
}
