"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useLocation } from "@/components/shell/app-shell";
import { checkAvailability, createBooking, joinWaitlist, leaveWaitlist, myCredits, myWaitlist, type Availability, type CreatedBooking, type WaitlistDTO } from "../actions";
import { KINDS, SLOTS, fmtIST, istToDate, kindLabel, priceLabel, rupees, todayIST } from "@/lib/booking";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/ics";
import { fmtMinutes, type Balance } from "@/lib/credit-math";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function BookFlow() {
  const { loc } = useLocation();
  const sp = useSearchParams();
  const startKind = KINDS.find((k) => k.id === sp.get("kind"))?.id ?? "meeting_room";
  const slot = (v: string | null, fallback: string) => (v && SLOTS.includes(v) ? v : fallback);
  const [kind, setKind] = React.useState<string>(startKind);
  const [date, setDate] = React.useState(/^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : todayIST());
  const [start, setStart] = React.useState(slot(sp.get("start"), "10:00"));
  const [end, setEnd] = React.useState(slot(sp.get("end"), "12:00"));
  const [repeat, setRepeat] = React.useState(1);
  const [options, setOptions] = React.useState<Availability[] | null>(null);
  const [sel, setSel] = React.useState<Availability | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<(CreatedBooking & { name: string }) | null>(null);
  const [credits, setCredits] = React.useState<Balance | null>(null);
  const [waiting, setWaiting] = React.useState<WaitlistDTO[]>([]);
  const [note, setNote] = React.useState<string | null>(null);

  const refreshWait = React.useCallback(() => { myWaitlist().then((r) => r.ok && setWaiting(r.data)); }, []);
  React.useEffect(() => { myCredits().then((r) => r.ok && setCredits(r.data)); refreshWait(); }, [refreshWait]);

  const reset = () => { setOptions(null); setSel(null); setError(null); setNote(null); };
  const check = async () => {
    reset(); setBusy(true);
    const r = await checkAvailability({ loc, kind, date, start, end });
    setBusy(false);
    if (!r.ok) setError(r.error); else setOptions(r.data);
  };
  const confirm = async () => {
    if (!sel) return;
    setBusy(true); setError(null);
    const r = await createBooking({ resourceId: sel.id, date, start, end, repeatWeeks: repeat > 1 ? repeat : undefined });
    setBusy(false);
    if (!r.ok) { setError(r.error); setOptions(null); setSel(null); return; }
    setDone({ ...r.data, name: sel.name });
  };
  const wait = async () => {
    setBusy(true); setError(null);
    const r = await joinWaitlist({ loc, kind, date, start, end });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setNote("You're on the waitlist. We'll notify you if a slot opens up."); refreshWait(); }
  };

  if (done) return (
    <Card className="mx-auto max-w-md text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check /></span>
      <h2 className="mt-4 text-xl font-semibold">{done.created > 1 ? `${done.created} bookings confirmed` : "Booking confirmed"}</h2>
      <p className="mt-1 text-muted">{done.name} · {date} · {start}–{end}{done.created > 1 ? ` · weekly` : ""}</p>
      <p className="mt-1 font-medium">{done.total === 0 ? "Covered by your plan credits" : `${rupees(done.total)} incl. GST`}</p>
      {(done.creditMinutes > 0 || done.creditPasses > 0) && (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Used {done.creditMinutes > 0 ? fmtMinutes(done.creditMinutes) + " of room time" : ""}{done.creditMinutes > 0 && done.creditPasses > 0 ? " and " : ""}{done.creditPasses > 0 ? `${done.creditPasses} day pass${done.creditPasses > 1 ? "es" : ""}` : ""} from your plan.</p>
      )}
      {done.skipped.length > 0 && <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Skipped: {done.skipped.map((x) => `${x.date} (${x.why})`).join(", ")}</p>}
      {done.total > 0 && <p className="mt-1 text-sm text-muted">Payment is collected at reception.</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
        <a href={`/api/calendar/booking/${done.id}${done.created > 1 ? "?series=1" : ""}`} className="rounded-xl border px-3 py-1.5 font-medium hover:bg-surface-2">Download .ics</a>
        <a href={googleCalendarUrl({ title: done.name, start: istToDate(date, start), end: istToDate(date, end) })} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-1.5 font-medium hover:bg-surface-2">Add to Google Calendar</a>
        <a href={outlookCalendarUrl({ title: done.name, start: istToDate(date, start), end: istToDate(date, end) })} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-1.5 font-medium hover:bg-surface-2">Add to Outlook</a>
      </div>
      <Link href="/bookings" className="mt-6 block"><Button className="w-full">View my bookings</Button></Link>
    </Card>
  );

  const noneFree = options !== null && options.length > 0 && options.every((o) => !o.available);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {credits && (credits.minutes > 0 || credits.passes > 0) && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          Your plan credits: <b>{fmtMinutes(credits.minutes)}</b> of meeting-room time{credits.passes > 0 ? <> and <b>{credits.passes}</b> hot-desk day pass{credits.passes > 1 ? "es" : ""}</> : null}. They are used automatically.
        </p>
      )}
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
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm font-medium">Date
            <input type="date" min={todayIST()} value={date} onChange={(e) => { setDate(e.target.value); reset(); }} className={field} />
          </label>
          <label className="text-sm font-medium">From
            <select value={start} onChange={(e) => { setStart(e.target.value); reset(); }} className={field}>{SLOTS.slice(0, -1).map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="text-sm font-medium">To
            <select value={end} onChange={(e) => { setEnd(e.target.value); reset(); }} className={field}>{SLOTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Repeat
            <select value={repeat} onChange={(e) => { setRepeat(Number(e.target.value)); reset(); }} className={field}>
              <option value={1}>Just once</option>
              {[2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>Weekly for {n} weeks</option>)}
            </select>
          </label>
        </div>
        <Button onClick={check} disabled={busy} className="w-full">{busy && !options ? "Checking…" : "Check availability"}</Button>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
        {note && <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{note}</p>}
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
                {o.available
                  ? <span className="text-right font-medium">{o.total === 0 && o.listTotal > 0 ? <span className="text-emerald-600">Covered by credits</span> : rupees(o.total)}{o.total < o.listTotal && o.total > 0 && <span className="block text-xs font-normal text-muted line-through">{rupees(o.listTotal)}</span>}</span>
                  : <Badge tone="red">Unavailable</Badge>}
              </button>
            ))}
            {noneFree && (
              <Card className="space-y-2">
                <p className="text-sm">Everything is taken at that time. Join the waitlist and we&apos;ll tell you the moment a slot opens up.</p>
                <Button variant="secondary" onClick={wait} disabled={busy}>Join the waitlist</Button>
              </Card>
            )}
          </div>
        ))}

      {sel && (
        <Card className="space-y-3">
          <h2 className="font-medium">Review</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{sel.name}</dt><dd>{date} · {start}–{end}{repeat > 1 ? ` · weekly × ${repeat}` : ""}</dd></div>
            {(sel.creditMinutes > 0 || sel.creditPasses > 0) && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><dt>Plan credits (per session)</dt><dd>{sel.creditMinutes > 0 ? `${fmtMinutes(sel.creditMinutes)}` : "1 day pass"}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{rupees(sel.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">GST 18%</dt><dd>{rupees(sel.tax)}</dd></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total{repeat > 1 ? " (first session)" : ""}</dt><dd>{rupees(sel.total)}</dd></div>
          </dl>
          {repeat > 1 && <p className="text-xs text-muted">Dates that are already taken are skipped. Credits are used from your balance in order, so later sessions may cost more if they run out.</p>}
          <Button onClick={confirm} disabled={busy} className="w-full">{busy ? "Booking…" : repeat > 1 ? `Confirm ${repeat} weekly bookings` : "Confirm booking"}</Button>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-medium">Your waitlist</h2>
          <ul className="divide-y text-sm">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{kindLabel(w.kind)} · {w.locationName} · {fmtIST(w.startsAt, { weekday: "short", day: "numeric", month: "short" })}, {fmtIST(w.startsAt, { hour: "numeric", minute: "2-digit" })}–{fmtIST(w.endsAt, { hour: "numeric", minute: "2-digit" })} {w.status === "notified" && <Badge tone="green">A slot opened</Badge>}</span>
                <Button size="sm" variant="ghost" onClick={async () => { await leaveWaitlist(w.id); refreshWait(); }}>Leave</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
