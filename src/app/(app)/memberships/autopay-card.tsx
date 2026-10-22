"use client";
import * as React from "react";
import { Badge, Button, Card } from "@/components/ui";
import { getMyAutopay, startAutopay, stopAutopay, type AutopayDTO } from "./autopay";
import { rupees } from "@/lib/booking";

const LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "grey" }> = {
  created: { text: "Waiting for you to authorise", tone: "amber" },
  authenticated: { text: "Authorised, starts at renewal", tone: "green" },
  active: { text: "On", tone: "green" },
  pending: { text: "Payment pending", tone: "amber" },
  halted: { text: "Stopped: payment failed", tone: "red" },
  paused: { text: "Paused", tone: "amber" },
};

/** Lets a member set up UPI / card autopay for their plan renewals. Only the member can do this: it is their consent to be charged. */
export function AutopayCard() {
  const [d, setD] = React.useState<AutopayDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<{ id: string; url: string } | null>(null);

  const load = React.useCallback(() => { getMyAutopay().then((r) => (r.ok ? setD(r.data) : setError(r.error))); }, []);
  React.useEffect(() => { load(); }, [load]);

  if (!d || d.items.length === 0) return null;
  const start = async (membershipId: string) => {
    setBusy(membershipId); setError(null);
    const r = await startAutopay(membershipId);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setLink({ id: membershipId, url: r.data.url });
    load();
  };
  const stop = async (mandateId: string) => {
    if (!window.confirm("Turn off autopay? You'll pay each renewal invoice yourself.")) return;
    setBusy(mandateId); setError(null);
    const r = await stopAutopay(mandateId);
    setBusy(null);
    if (!r.ok) setError(r.error); else load();
  };

  return (
    <Card className="mb-6 space-y-3">
      <div><h2 className="font-medium">Autopay</h2><p className="text-sm text-muted">Pay renewals automatically with UPI or your card. You approve once with your bank, and you can turn it off any time.</p></div>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {d.items.map((it) => {
        const m = it.mandate, lab = m ? (LABEL[m.status] ?? { text: m.status, tone: "grey" as const }) : null;
        return (
          <div key={it.membershipId} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
            <div><p className="font-medium">{it.plan}</p><p className="text-muted">{rupees(it.amountPaise)} (incl. GST) each cycle · next renewal {it.renewalDate}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {lab && <Badge tone={lab.tone}>{lab.text}</Badge>}
              {m && m.status === "created" && m.shortUrl && <a href={m.shortUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-1.5 font-medium text-accent hover:bg-surface-2">Authorise now</a>}
              {m ? <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => stop(m.id)}>Turn off</Button>
                : <Button size="sm" disabled={!d.enabled || busy === it.membershipId} onClick={() => start(it.membershipId)} title={d.enabled ? "" : "Online payments aren't set up yet"}>{busy === it.membershipId ? "Setting up…" : "Set up autopay"}</Button>}
            </div>
            {link?.id === it.membershipId && <p className="w-full rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-800 dark:text-emerald-300">Almost done. <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">Open the secure page to approve with your bank</a>.</p>}
          </div>
        );
      })}
    </Card>
  );
}
