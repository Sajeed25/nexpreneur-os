"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { fmtIST, istToDate } from "@/lib/booking";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/ics";
import { tourEnd } from "@/lib/tour-math";
import { bookTour, loadSlots, requestContact, type Booked, type TourPage } from "../actions";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function TourForm({ slug, data }: { slug: string; data: TourPage }) {
  const [mode, setMode] = React.useState<"tour" | "contact">("tour");
  const [loc, setLoc] = React.useState(data.locations[0]?.id ?? "");
  const [date, setDate] = React.useState(data.days[0] ?? "");
  const [time, setTime] = React.useState("");
  const [slots, setSlots] = React.useState<{ time: string; left: number; bookable: boolean }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ kind: "tour"; b: Booked; date: string; time: string } | { kind: "contact" } | null>(null);

  React.useEffect(() => {
    if (mode !== "tour" || !loc || !date) return;
    let live = true;
    setTime("");
    loadSlots(slug, loc, date).then((r) => { if (live && r.ok) setSlots(r.data); });
    return () => { live = false; };
  }, [slug, loc, date, mode]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "");
    const base = { slug, name: g("name"), phone: g("phone"), email: g("email"), company: g("company"), requirements: g("requirements"), website: g("website") };
    setBusy(true); setError(null);
    if (mode === "contact") {
      const r = await requestContact(base);
      setBusy(false);
      return r.ok ? setDone({ kind: "contact" }) : setError(r.error);
    }
    if (!time) { setBusy(false); return setError("Pick a time for your tour."); }
    const r = await bookTour({ ...base, locationId: loc, date, time });
    setBusy(false);
    if (!r.ok) { setError(r.error); loadSlots(slug, loc, date).then((s) => s.ok && setSlots(s.data)); return; }
    setDone({ kind: "tour", b: r.data, date, time });
  };

  if (done?.kind === "contact") return (
    <Card className="text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check /></span>
      <h1 className="mt-4 text-xl font-semibold">Thanks, we&apos;ll be in touch</h1><p className="mt-1 text-muted">Someone from {data.org} will contact you shortly.</p></Card>
  );
  if (done?.kind === "tour") {
    const ev = { title: `Tour of ${data.org} ${done.b.location}`, start: istToDate(done.date, done.time), end: tourEnd(done.date, done.time), description: "A guided tour of the space.", location: done.b.location };
    return (
      <Card className="space-y-3 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check /></span>
        <h1 className="text-xl font-semibold">Your tour is booked</h1>
        <p className="text-lg font-medium">{done.b.when}</p><p className="text-muted">{data.org} {done.b.location}</p>
        {done.b.emailed ? <p className="text-sm text-muted">We&apos;ve emailed you the details with a calendar invite.</p> : <p className="text-sm text-muted">Save the details above. We&apos;ll call you to confirm.</p>}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-surface-2">Add to Google Calendar</a>
          <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-surface-2">Add to Outlook</a>
        </div>
        {done.b.token && <p className="pt-2 text-sm"><a href={`/tour/cancel?token=${done.b.token}`} className="text-accent hover:underline">Need to change plans? Cancel this tour</a></p>}
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div><h1 className="text-2xl font-semibold tracking-tight">Visit {data.org}</h1><p className="mt-1 text-muted">See the space, meet the team, and find the right desk or office for you.</p></div>
      <div role="tablist" className="inline-flex gap-1 rounded-xl border bg-surface p-1">
        {([["tour", "Book a tour"], ["contact", "Just contact me"]] as const).map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("h-9 rounded-lg px-4 text-sm", mode === m ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{l}</button>
        ))}
      </div>

      {mode === "tour" && (
        <Card className="space-y-4">
          {data.locations.length > 1 && (
            <label className="block text-sm font-medium">Which location?
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className={field}>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.city ? `, ${l.city}` : ""}</option>)}</select>
            </label>
          )}
          {data.locations.find((l) => l.id === loc)?.address && <p className="text-sm text-muted">{data.locations.find((l) => l.id === loc)?.address}</p>}
          <label className="block text-sm font-medium">Day
            <select value={date} onChange={(e) => setDate(e.target.value)} className={field}>{data.days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}</select>
          </label>
          <div>
            <p className="text-sm font-medium">Time</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Time">
              {slots.map((s) => (
                <button key={s.time} type="button" role="radio" aria-checked={time === s.time} disabled={!s.bookable} onClick={() => setTime(s.time)}
                  className={cn("h-11 rounded-xl border text-sm", time === s.time ? "border-accent bg-accent-soft font-medium text-accent" : "hover:bg-surface-2", !s.bookable && "opacity-40")}>
                  {fmtIST(istToDate(date, s.time).toISOString(), { hour: "numeric", minute: "2-digit" })}{!s.bookable && s.left === 0 ? " · full" : ""}
                </button>
              ))}
              {slots.length === 0 && <p className="col-span-full text-sm text-muted">Loading times…</p>}
            </div>
            <p className="mt-1.5 text-xs text-muted">Tours take about 45 minutes. Times are India Standard Time.</p>
          </div>
        </Card>
      )}

      <Card className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Your name<input name="name" required minLength={2} maxLength={160} autoComplete="name" className={field} /></label>
        <label className="text-sm font-medium">Company (optional)<input name="company" maxLength={160} autoComplete="organization" className={field} /></label>
        <label className="text-sm font-medium">Email<input name="email" type="email" required maxLength={190} autoComplete="email" className={field} /></label>
        <label className="text-sm font-medium">Phone<input name="phone" type="tel" maxLength={20} autoComplete="tel" className={field} /></label>
        <label className="text-sm font-medium sm:col-span-2">What are you looking for?<textarea name="requirements" rows={3} maxLength={1000} className={field + " h-auto py-2"} placeholder="A desk for 2, a private office for 6, a meeting room…" /></label>
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 sm:col-span-2">{error}</p>}
        <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Sending…" : mode === "tour" ? "Book my tour" : "Send my details"}</Button>
        <p className="text-xs text-muted sm:col-span-2">We use your details only to arrange your visit and answer your questions.</p>
      </Card>
    </form>
  );
}
