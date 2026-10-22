"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { getBadge, type BadgeDTO } from "../../actions";

/** A visitor badge sized for a standard 100 x 70 mm label or card stock. Print it when the guest arrives. */
export function BadgeView({ id }: { id: string }) {
  const [b, setB] = React.useState<BadgeDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { getBadge(id).then((r) => (r.ok ? setB(r.data) : setError(r.error))); }, [id]);
  if (error) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!b) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="no-print flex items-center justify-between">
        <Link href="/visitors" className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Visitors</Link>
        <Button size="sm" onClick={() => window.print()}><Printer size={16} />Print badge</Button>
      </div>
      <div id="badge" className="flex aspect-[100/70] w-full overflow-hidden rounded-2xl border-2 border-[#042341] bg-white text-[#042341]">
        <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
          <div><p className="inline-block rounded bg-[#F15A24] px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white">Visitor</p>
            <p className="mt-3 truncate text-3xl font-bold leading-tight">{b.name}</p>
            <p className="mt-1 text-sm">Visiting <b>{b.host}</b></p></div>
          <div className="text-xs"><p>{b.date} · {b.time}</p>{b.purpose && <p className="truncate">{b.purpose}</p>}<p className="mt-1 font-semibold uppercase tracking-wide opacity-70">{b.org}</p></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="grid w-[38%] shrink-0 place-items-center border-l border-dashed border-[#042341]/30 p-2"><img src={b.qr} alt="Visitor QR code" className="w-full" /></div>
      </div>
      <p className="no-print text-center text-sm text-muted">{b.status === "checked_in" ? "Checked in. The code on the badge also opens the door." : "Check the visitor in first. Their QR code only opens the door once they've been checked in."}</p>
      <style>{`@media print { @page { size: 100mm 70mm; margin: 0 } body * { visibility: hidden } #badge, #badge * { visibility: visible } #badge { position: fixed; inset: 0; width: 100mm; height: 70mm; border-radius: 0; border: 0 } }`}</style>
    </div>
  );
}
