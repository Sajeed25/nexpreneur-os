"use client";
import * as React from "react";
import { Badge, Button, Card } from "@/components/ui";
import { addCard, getMemberAccess, setCardActive, type MemberAccess } from "./access";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

/** A member's door access: their cards, and when they last tried a door. Everyone also has a phone pass under Profile. */
export function AccessPanel({ userId }: { userId: string }) {
  const [d, setD] = React.useState<MemberAccess | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { getMemberAccess(userId).then((r) => (r.ok ? (setError(null), setD(r.data)) : setError(r.error))); }, [userId, tick]);

  if (!d) return error ? <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p> : <p className="text-sm text-muted">Loading…</p>;
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    setBusy(true); setError(null);
    const r = await addCard(userId, { cardId: String(f.get("cardId")), label: String(f.get("label") ?? "") });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    form.reset(); setTick((t) => t + 1);
  };
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <Card className="space-y-3">
        <div><h2 className="font-medium">Cards</h2><p className="text-sm text-muted">A physical card or fob works at the door alongside the phone pass. Only a scrambled copy of the card number is stored.</p></div>
        {d.cards.length === 0 ? <p className="text-sm text-muted">No cards linked.</p> : (
          <ul className="divide-y text-sm">{d.cards.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="font-medium">{c.label} <span className="text-xs font-normal text-muted">· added {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></span>
              <span className="flex items-center gap-2"><Badge tone={c.active ? "green" : "grey"}>{c.active ? "Active" : "Off"}</Badge>{d.canEdit && <Button size="sm" variant="ghost" onClick={async () => { await setCardActive(c.id, !c.active); setTick((t) => t + 1); }}>{c.active ? "Turn off" : "Turn on"}</Button>}</span>
            </li>
          ))}</ul>
        )}
        {d.canEdit && (
          <form onSubmit={add} className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm font-medium">Card number<input name="cardId" required maxLength={60} className={field} placeholder="04:A3:5B:1C" /></label>
            <label className="text-sm font-medium">Label (optional)<input name="label" maxLength={60} className={field} placeholder="Blue fob" /></label>
            <Button type="submit" disabled={busy} className="self-end">{busy ? "Linking…" : "Link card"}</Button>
          </form>
        )}
      </Card>
      <Card className="py-1">
        <h2 className="px-1 pt-3 font-medium">Recent door activity</h2>
        {d.events.length === 0 ? <p className="py-6 text-center text-sm text-muted">No door activity yet.</p> : (
          <ul className="divide-y text-sm">{d.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><Badge tone={e.allowed ? "green" : "red"}>{e.allowed ? "Let in" : "Refused"}</Badge> <span className="text-muted">{e.door} · {e.credential}{e.reason ? ` · ${e.reason}` : ""}</span></span>
              <span className="text-xs text-muted">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
