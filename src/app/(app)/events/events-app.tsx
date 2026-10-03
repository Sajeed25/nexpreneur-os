"use client";
import * as React from "react";
import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { SLOTS, fmtIST, rupees, todayIST } from "@/lib/booking";
import { cancelRegistration, createEvent, listAttendees, listEvents, registerForEvent, setPublished, type EventDTO } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function EventsApp({ manage }: { manage: boolean }) {
  const [rows, setRows] = React.useState<EventDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<{ text: string; invoiceId?: string | null } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [showForm, setShowForm] = React.useState(false);
  const [attendees, setAttendees] = React.useState<{ id: string; list: { name: string; email: string }[] } | null>(null);

  React.useEffect(() => {
    let live = true;
    listEvents().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load events."); } });
    return () => { live = false; };
  }, [tick]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const g = (k: string) => String(f.get(k) ?? "");
    setBusy("new");
    const r = await createEvent({ title: g("title"), description: g("description"), date: g("date"), start: g("start"), end: g("end"), venue: g("venue"), capacity: Number(g("capacity")), price: Number(g("price") || 0), organizer: g("organizer"), publish: f.get("publish") === "on" });
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setShowForm(false); setTick((t) => t + 1); }
  };
  const register = async (id: string) => {
    setBusy(id); setInfo(null);
    const r = await registerForEvent(id);
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); setInfo({ text: r.data.invoiceId ? "You're registered. Pay the ticket invoice to confirm your seat." : "You're registered!", invoiceId: r.data.invoiceId }); setTick((t) => t + 1); }
  };
  const cancel = async (id: string) => {
    if (!window.confirm("Cancel your registration?")) return;
    setBusy(id);
    const r = await cancelRegistration(id);
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); setInfo({ text: "Registration cancelled." }); setTick((t) => t + 1); }
  };
  const toggle = async (e: EventDTO) => {
    const r = await setPublished(e.id, !e.published);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };
  const showAttendees = async (id: string) => {
    if (attendees?.id === id) { setAttendees(null); return; }
    const r = await listAttendees(id);
    if (!r.ok) setError(r.error); else setAttendees({ id, list: r.data });
  };

  return (
    <>
      <PageHeader title="Events" sub={manage ? "Create and manage community events." : "Workshops, meetups and more."}
        actions={manage && <Button onClick={() => setShowForm(!showForm)}>Create event</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info.text} {info.invoiceId && <Link href={`/invoices/${info.invoiceId}`} className="font-medium underline">View invoice</Link>}</p>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Title<input name="title" required minLength={3} maxLength={160} className={field} /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" rows={3} maxLength={2000} className={field + " h-auto py-2"} /></label>
            <label className="text-sm font-medium">Date<input name="date" type="date" min={todayIST()} defaultValue={todayIST()} required className={field} /></label>
            <label className="text-sm font-medium">Venue<input name="venue" maxLength={160} className={field} placeholder="Event Space, Hyderabad" /></label>
            <label className="text-sm font-medium">Starts<select name="start" defaultValue="18:00" className={field}>{SLOTS.slice(0, -1).map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-medium">Ends<select name="end" defaultValue="20:00" className={field}>{SLOTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-medium">Capacity<input name="capacity" type="number" min={1} defaultValue={50} required className={field} /></label>
            <label className="text-sm font-medium">Ticket price (₹, before GST)<input name="price" type="number" min={0} defaultValue={0} className={field} /></label>
            <label className="text-sm font-medium">Organizer<input name="organizer" maxLength={120} className={field} /></label>
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="publish" defaultChecked />Publish now</label>
            <p className="text-xs text-muted sm:col-span-2">Event images are coming soon.</p>
            <Button type="submit" disabled={busy === "new"} className="sm:col-span-2">{busy === "new" ? "Saving…" : "Create event"}</Button>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No upcoming events" hint={manage ? "Create the first one." : "Check back soon."} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((e) => {
            const left = e.capacity - e.registered;
            return (
              <Card key={e.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{e.title}</h2>
                  {manage && <Badge tone={e.published ? "green" : "grey"}>{e.published ? "Published" : "Draft"}</Badge>}
                </div>
                {e.description && <p className="text-sm text-muted">{e.description}</p>}
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2"><Calendar size={15} className="text-muted" />{fmtIST(e.startsAt, { weekday: "short", day: "numeric", month: "short" })} · {fmtIST(e.startsAt, { hour: "numeric", minute: "2-digit" })} – {fmtIST(e.endsAt, { hour: "numeric", minute: "2-digit" })}</li>
                  {e.venue && <li className="flex items-center gap-2"><MapPin size={15} className="text-muted" />{e.venue}</li>}
                  <li className="flex items-center gap-2"><Users size={15} className="text-muted" />{e.registered}/{e.capacity} registered{left <= 0 ? " · Full" : ""} · {e.pricePaise > 0 ? `${rupees(e.pricePaise)} + GST` : "Free"}</li>
                </ul>
                <div className="flex flex-wrap gap-2">
                  {e.mine ? <>
                    <Badge tone="green">You&apos;re going</Badge>
                    {e.invoiceId && <Link href={`/invoices/${e.invoiceId}`}><Button size="sm" variant="secondary">Ticket invoice</Button></Link>}
                    <Button size="sm" variant="ghost" disabled={busy === e.id} onClick={() => cancel(e.id)}>Cancel registration</Button>
                  </> : e.published && <Button size="sm" disabled={busy === e.id || left <= 0} onClick={() => register(e.id)}>{left <= 0 ? "Full" : busy === e.id ? "Registering…" : e.pricePaise > 0 ? "Register & get invoice" : "Register"}</Button>}
                  {manage && <>
                    <Button size="sm" variant="secondary" onClick={() => toggle(e)}>{e.published ? "Unpublish" : "Publish"}</Button>
                    <Button size="sm" variant="secondary" onClick={() => showAttendees(e.id)}>Attendees</Button>
                  </>}
                </div>
                {attendees?.id === e.id && (attendees.list.length === 0 ? <p className="text-sm text-muted">No registrations yet.</p> : <ul className="space-y-1 border-t pt-2 text-sm">{attendees.list.map((a) => <li key={a.email}>{a.name} <span className="text-muted">· {a.email}</span></li>)}</ul>)}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
