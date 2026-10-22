"use client";
import * as React from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { acceptAgreement, getOnboarding, requestDeposit, setOnboardingItem, type OnboardingDTO } from "./onboarding";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const TONE = { done: "green", waived: "grey", pending: "amber" } as const;
const LABEL = { done: "Done", waived: "Waived", pending: "To do" } as const;

/** The onboarding checklist. Staff see every control; a member sees their own steps and can accept the agreement. */
export function OnboardingPanel({ userId, compact = false, onChange }: { userId: string; compact?: boolean; onChange?: () => void }) {
  const [d, setD] = React.useState<OnboardingDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { getOnboarding(userId).then((r) => (r.ok ? (setError(null), setD(r.data)) : setError(r.error))); }, [userId, tick]);

  if (error) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  if (d.state.items.length === 0) return compact ? null : <Card><p className="text-sm text-muted">No onboarding steps are turned on. Choose them under Settings &gt; Policies.</p></Card>;
  if (compact && d.state.complete) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Something went wrong");
    setTick((t) => t + 1); onChange?.();
  };
  const done = d.state.items.filter((i) => i.status !== "pending").length;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-medium">{d.self && compact ? "Finish setting up" : "Onboarding"}</h2>
          <p className="text-sm text-muted">{d.state.complete ? "All steps are complete." : `${done} of ${d.state.items.length} done${d.self && d.state.blocks ? ". You can book and enter once these are complete." : "."}`}</p></div>
        {d.state.complete && <Badge tone="green">Complete</Badge>}
      </div>
      <ul className="divide-y text-sm">
        {d.state.items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div><p className="font-medium">{it.label}</p><p className="text-xs text-muted">{it.note ?? it.hint}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[it.status]}>{LABEL[it.status]}</Badge>
              {d.self && it.id === "agreement" && it.status === "pending" && <Button size="sm" onClick={() => setReading(!reading)}>Read &amp; accept</Button>}
              {d.self && it.id === "emergency" && it.status === "pending" && <Link href="/profile" className="text-sm font-medium text-accent hover:underline">Add on your profile</Link>}
              {d.self && it.id === "deposit" && it.refInvoiceId && it.status === "pending" && <Link href={`/invoices/${it.refInvoiceId}`} className="text-sm font-medium text-accent hover:underline">Pay the deposit</Link>}
              {!d.self && d.canEdit && !it.auto && (it.status === "pending"
                ? <><Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setOnboardingItem(userId, { item: it.id, status: "done" }))}>Mark done</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setOnboardingItem(userId, { item: it.id, status: "waived", note: "Waived by staff" }))}>Waive</Button></>
                : <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setOnboardingItem(userId, { item: it.id, status: "pending" }))}>Undo</Button>)}
              {!d.self && d.canDeposit && it.id === "deposit" && it.status === "pending" && !it.refInvoiceId && (
                <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("amt")); run(() => requestDeposit(userId, v)); }}>
                  <input name="amt" type="number" min="1" step="1" required placeholder="₹ amount" aria-label="Deposit amount in rupees" className={field + " mt-0 h-9 w-28"} />
                  <Button size="sm" type="submit" disabled={busy}>Raise invoice</Button>
                </form>
              )}
              {!d.self && it.id === "deposit" && it.refInvoiceId && <Link href={`/invoices/${it.refInvoiceId}`} className="text-sm font-medium text-accent hover:underline">View invoice</Link>}
            </div>
          </li>
        ))}
      </ul>
      {d.self && reading && (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="whitespace-pre-wrap text-sm">{d.agreementText}</p>
          <Button size="sm" disabled={busy} onClick={() => run(() => acceptAgreement()).then(() => setReading(false))}>I accept the agreement</Button>
        </div>
      )}
    </Card>
  );
}
