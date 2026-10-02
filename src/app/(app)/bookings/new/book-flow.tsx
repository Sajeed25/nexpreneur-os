"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useLocation } from "@/components/shell/app-shell";
import { checkAvailability, createBooking, type Availability } from "../actions";
import { KINDS, SLOTS, kindLabel, priceLabel, rupees, todayIST } from "@/lib/booking";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function BookFlow() {
  const { loc } = useLocation();
  const sp = useSearchParams();
  const startKind = KINDS.find((k) => k.id === sp.get("kind"))?.id ?? "meeting_room";
  const [kind, setKind] = React.useState<string>(startKind);
  const [date, setDate] = React.useState(todayIST());
  const [start, setStart] = React.useState("10:00");
  const [end, setEnd] = React.useState("12:00");
  const [options, setOptions] = React.useState<Availability[] | null>(null);
  const [sel, setSel] = React.useState<Availability | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ total: number; name: string } | null>(null);

  const reset = () => { setOptions(null); setSel(null); setError(null); };
  const check = async () => {
    reset(); setBusy(true);
    const r = await checkAvailability({ loc, kind, date, start, end });
    setBusy(false);
    if (!r.ok) setError(r.error); else setOptions(r.data);
  };
  const confirm = async () => {
    if (!sel) return;
    setBusy(true); setError(null);
    const r = await createBooking({ resourceId: sel.id, date, start, end });
    setBusy(false);
    if (!r.ok) { setError(r.error); setOptions(null); setSel(null); return; }
    setDone({ total: r.data.total, name: sel.name });
  };

  if (done) return (
    <Card className="mx-auto max-w-md text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check /></span>
      <h2 className="mt-4 text-xl font-semibold">Booking confirmed</h2>
      <p className="mt-1 text-muted">{done.name} · {date} · {start}–{end}</p>
      <p className="mt-1 font-medium">{rupees(done.total)} incl. GST</p>
      <p className="mt-1 text-sm text-muted">Payment is collected at reception for now. Online payment is coming soon.</p>
      <Link href="/bookings" className="mt-6 block"><Button className="w-full">View my bookings</Button></Link>
    </Card>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="space-y-4">
        <p className="text-sm text-muted">Where? Use the location selector at the top of the page.</p>
        <div>
          <p className="text-sm font-medium">What?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {KINDS.filter((k) => k.id !== "other").map((k) => (
              <button key={k.id} onClick={() => { setKind(k.id); reset(); }}
                className={cn("h-10 rounded-xl border px-3 text-sm", kind === k.id ? "border-accent bg-accent-soft font-medium text-accent" : "hover:bg-surface-2")}>{k.label}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Date
            <input type="date" min={todayIST()} value={date} onChange={(e) => { setDate(e.target.value); reset(); }} className={field} />
          </label>
          <label className="text-sm font-medium">From
            <select value={start} onChange={(e) => { setStart(e.target.value); reset(); }} className={field}>{SLOTS.slice(0, -1).map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="text-sm font-medium">To
            <select value={end} onChange={(e) => { setEnd(e.target.value); reset(); }} className={field}>{SLOTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        <Button onClick={check} disabled={busy} className="w-full">{busy && !options ? "Checking…" : "Check availability"}</Button>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </Card>

      {options && (options.length === 0
        ? <EmptyState title={`No ${kindLabel(kind).toLowerCase()}s at this location`} hint="Try another location or type, or ask an admin to add resources." />
        : (
          <div className="space-y-2">
            <h2 className="font-medium">Available spaces ({options.filter((o) => o.available).length} of {options.length})</h2>
            {options.map((o) => (
              <button key={o.id} disabled={!o.available} onClick={() => setSel(o)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-left transition", sel?.id === o.id ? "border-accent ring-2 ring-accent/20" : "hover:border-accent/50", !o.available && "opacity-50")}>
                <span><span className="block font-medium">{o.name}</span><span className="text-sm text-muted">{o.capacity} {o.capacity === 1 ? "person" : "people"} · {priceLabel(o)}</span></span>
                {o.available ? <span className="font-medium">{rupees(o.total)}</span> : <Badge tone="red">Unavailable</Badge>}
              </button>
            ))}
          </div>
        ))}

      {sel && (
        <Card className="space-y-3">
          <h2 className="font-medium">Review</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{sel.name}</dt><dd>{date} · {start}–{end}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{rupees(sel.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">GST 18%</dt><dd>{rupees(sel.tax)}</dd></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd>{rupees(sel.total)}</dd></div>
          </dl>
          <Button onClick={confirm} disabled={busy} className="w-full">{busy ? "Booking…" : "Confirm booking"}</Button>
        </Card>
      )}
    </div>
  );
}
