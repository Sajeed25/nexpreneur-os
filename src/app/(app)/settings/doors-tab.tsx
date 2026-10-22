"use client";
import * as React from "react";
import { Badge, Button, Card } from "@/components/ui";
import { addDoor, getDoors, rotateDoorKey, setDoorActive, type DoorsData } from "./doors";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

/** Door controllers, their keys, and the log of who tried to get in. */
export function DoorsTab() {
  const [d, setD] = React.useState<DoorsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState<{ name: string; key: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { getDoors().then((r) => (r.ok ? (setError(null), setD(r.data)) : setError(r.error))); }, [tick]);

  if (error) return <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    setBusy(true);
    const r = await addDoor({ name: String(f.get("name")), locationId: String(f.get("locationId")) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setKey({ name: String(f.get("name")), key: r.data.key }); form.reset(); setTick((t) => t + 1);
  };
  const rotate = async (id: string, name: string) => {
    if (!window.confirm(`Make a new key for ${name}? The old one stops working immediately, so update the door controller.`)) return;
    const r = await rotateDoorKey(id);
    if (!r.ok) setError(r.error); else setKey({ name, key: r.data.key });
  };
  const toggle = async (id: string, active: boolean) => { await setDoorActive(id, !active); setTick((t) => t + 1); };

  return (
    <div className="space-y-4">
      {key && (
        <Card className="space-y-2 border-amber-500/40 bg-amber-500/5">
          <p className="font-medium">Key for {key.name}</p>
          <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-sm">{key.key}</code>
          <p className="text-sm text-muted">Copy it into the door controller now. It is shown only once; if it&apos;s lost, make a new one.</p>
          <Button size="sm" variant="secondary" onClick={() => setKey(null)}>I&apos;ve saved it</Button>
        </Card>
      )}
      <Card className="space-y-3">
        <div><h2 className="font-medium">Door controllers</h2>
          <p className="text-sm text-muted">Your door hardware (or a small script on a Raspberry Pi) sends what it scanned to <code className="rounded bg-surface-2 px-1">{d.endpoint}</code> with the door&apos;s key in the <code className="rounded bg-surface-2 px-1">X-Door-Key</code> header, and opens the door when the answer says <code className="rounded bg-surface-2 px-1">allow: true</code>.</p></div>
        {d.doors.length === 0 ? <p className="text-sm text-muted">No doors yet.</p> : (
          <ul className="divide-y text-sm">{d.doors.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><p className="font-medium">{x.name} <span className="text-muted">· {x.locationName}</span></p><p className="text-xs text-muted">{x.lastSeenAt ? `Last heard from ${new Date(x.lastSeenAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Hasn't connected yet"}</p></div>
              <div className="flex items-center gap-2"><Badge tone={x.active ? "green" : "grey"}>{x.active ? "On" : "Off"}</Badge>
                <Button size="sm" variant="secondary" onClick={() => rotate(x.id, x.name)}>New key</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(x.id, x.active)}>{x.active ? "Turn off" : "Turn on"}</Button></div>
            </li>
          ))}</ul>
        )}
        <form onSubmit={add} className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">Door name<input name="name" required minLength={2} maxLength={120} className={field} placeholder="Main entrance" /></label>
          <label className="text-sm font-medium">Location<select name="locationId" required className={field}>{d.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <Button type="submit" disabled={busy} className="self-end">{busy ? "Adding…" : "Add door"}</Button>
        </form>
      </Card>
      <Card className="py-1">
        <h2 className="px-1 pt-3 font-medium">Recent attempts</h2>
        {d.events.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nobody has used a door yet.</p> : (
          <ul className="divide-y text-sm">{d.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><Badge tone={e.allowed ? "green" : "red"}>{e.allowed ? "Let in" : "Refused"}</Badge> <span className="font-medium">{e.who ?? "Unknown"}</span> <span className="text-muted">· {e.door} · {e.credential}{e.reason ? ` · ${e.reason}` : ""}</span></span>
              <span className="text-xs text-muted">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
