"use client";
import * as React from "react";
import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { SLOTS, fmtIST, rupees, todayIST } from "@/lib/booking";
import { uploadImage } from "@/app/images/actions";
import { resizeToJpeg } from "@/lib/client-image";
import { cancelRegistration, createEvent, listAttendees, listEvents, registerForEvent, setPublished, updateEvent, type EventDTO } from "./actions";

const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function EventsApp({ manage }: { manage: boolean }) {
  const [rows, setRows] = React.useState<EventDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<{ text: string; invoiceId?: string | null } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [form, setForm] = React.useState<"new" | EventDTO | null>(null);
  const editing = form && form !== "new" ? form : null;
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
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const g = (k: string) => String(f.get(k) ?? "");
    setBusy("new");
    let imageId: string | undefined;
    const photo = f.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const blob = await resizeToJpeg(photo);
      if (!blob) { setBusy(null); setError("That file isn't a readable image."); return; }
      const up = new FormData(); up.set("file", new File([blob], "event.jpg", { type: "image/jpeg" }));
      const u = await uploadImage(up);
      if (!u.ok) { setBusy(null); setError(u.error); return; }
      imageId = u.id;
    }
    const payload = { imageId, title: g("title"), description: g("description"), date: g("date"), start: g("start"), end: g("end"), venue: g("venue"), capacity: Number(g("capacity")), price: Number(g("price") || 0), organizer: g("organizer"), publish: f.get("publish") === "on" };
    const r = editing ? await updateEvent(editing.id, payload) : await createEvent(payload);
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); formEl.reset(); setForm(null); setTick((t) => t + 1); }
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
        actions={manage && <Button onClick={() => setForm(form === "new" ? null : "new")}>Create event</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info.text} {info.invoiceId && <Link href={`/invoices/${info.invoiceId}`} className="font-medium underline">View invoice</Link>}</p>}

      {form && (
        <Card className="mb-6">
          <form key={editing?.id ?? "new"} onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Title<input name="title" defaultValue={editing?.title} required minLength={3} maxLength={160} className={field} /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" defaultValue={editing?.description} rows={3} maxLength={2000} className={field + " h-auto py-2"} /></label>
            <label className="text-sm font-medium">Date<input name="date" type="date" min={editing ? undefined : todayIST()} defaultValue={editing ? istDate(editing.startsAt) : todayIST()} required className={field} /></label>
            <label className="text-sm font-medium">Venue<input name="venue" defaultValue={editing?.venue} maxLength={160} className={field} placeholder="Event Space, Hyderabad" /></label>
            <label className="text-sm font-medium">Starts<select name="start" defaultValue={editing ? istTime(editing.startsAt) : "18:00"} className={field}>{SLOTS.slice(0, -1).map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-medium">Ends<select name="end" defaultValue={editing ? istTime(editing.endsAt) : "20:00"} className={field}>{SLOTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-medium">Capacity{editing && editing.registered > 0 && <span className="font-normal text-muted"> ({editing.registered} registered)</span>}<input name="capacity" type="number" min={Math.max(1, editing?.registered ?? 1)} defaultValue={editing?.capacity ?? 50} required className={field} /></label>
            <label className="text-sm font-medium">Ticket price (₹, before GST){editing && <span className="font-normal text-muted"> (applies to new sign-ups)</span>}<input name="price" type="number" min={0} step="0.01" defaultValue={editing ? editing.pricePaise / 100 : 0} className={field} /></label>
            <label className="text-sm font-medium">Organizer<input name="organizer" defaultValue={editing?.organizer} maxLength={120} className={field} /></label>
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="publish" defaultChecked={editing ? editing.published : true} />{editing ? "Published" : "Publish now"}</label>
            <label className="text-sm font-medium sm:col-span-2">Event image {editing ? "(leave empty to keep the current one)" : "(optional)"}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" /></label>
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy === "new"}>{busy === "new" ? "Saving…" : editing ? "Save changes" : "Create event"}</Button><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button></div>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No upcoming events" hint={manage ? "Create the first one." : "Check back soon."} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((e) => {
            const left = e.capacity - e.registered;
            return (
              <Card key={e.id} className="space-y-3 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.imageId && <img src={`/api/images/${e.imageId}`} alt="" loading="lazy" className="-mx-5 -mt-5 mb-1 h-40 w-[calc(100%+2.5rem)] max-w-none object-cover" />}
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
                    <Button size="sm" variant="secondary" onClick={() => { setForm(e); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</Button>
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
