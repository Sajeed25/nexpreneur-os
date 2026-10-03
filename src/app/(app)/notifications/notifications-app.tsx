"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, CalendarCheck, CreditCard, DoorOpen, FileText, LifeBuoy, Megaphone, PartyPopper, RefreshCw, ShoppingBag, Undo2 } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { listNotifications, markAllRead, markRead, sendAnnouncement, type NotificationDTO } from "./actions";

const ICON: Record<string, typeof Bell> = {
  booking: CalendarCheck, invoice: FileText, payment: CreditCard, refund: Undo2, renewal: RefreshCw, reminder: Bell,
  event: PartyPopper, visitor: DoorOpen, support: LifeBuoy, announcement: Megaphone, service: ShoppingBag,
};
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const field = "mt-1.5 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function NotificationsApp({ canAnnounce }: { canAnnounce: boolean }) {
  const [rows, setRows] = React.useState<NotificationDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    listNotifications().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load notifications."); } });
    return () => { live = false; };
  }, [tick]);

  const read = async (n: NotificationDTO) => {
    if (n.read) return;
    setRows((rs) => rs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await markRead(n.id);
    window.dispatchEvent(new Event("nx:notifications"));
  };
  const all = async () => { await markAllRead(); setTick((t) => t + 1); window.dispatchEvent(new Event("nx:notifications")); };
  const announce = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setInfo(null);
    const r = await sendAnnouncement({ title: String(f.get("title")), body: String(f.get("body")) });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setInfo(`Announcement sent to ${r.data.sent} people.`); form.reset(); setTick((t) => t + 1); }
  };
  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" sub={unread ? `${unread} unread` : "You're all caught up."} actions={unread > 0 && <Button variant="secondary" size="sm" onClick={all}>Mark all as read</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      {canAnnounce && (
        <Card className="mb-6">
          <form onSubmit={announce} className="space-y-3">
            <h2 className="font-medium">Send an announcement</h2>
            <input name="title" required minLength={3} maxLength={160} placeholder="Title" aria-label="Title" className={field + " h-11"} />
            <textarea name="body" rows={2} maxLength={500} placeholder="Details (optional)" aria-label="Details" className={field + " py-2"} />
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Sending…" : "Send to everyone"}</Button>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No notifications yet" hint="Bookings, invoices, payments and announcements will show up here." /> : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            const inner = (
              <div className={cn("flex items-start gap-3 rounded-2xl border bg-surface p-4 transition hover:border-accent/50", !n.read && "border-accent/40 bg-accent-soft/40")}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{n.title}</span>{n.body && <span className="block text-sm text-muted">{n.body}</span>}<span className="text-xs text-muted">{ago(n.at)}</span></span>
                {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} onClick={() => read(n)}>{inner}</Link> : <button className="block w-full text-left" onClick={() => read(n)}>{inner}</button>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
