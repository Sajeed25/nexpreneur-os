"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getCalendarFeed, revokeCalendarFeed, rotateCalendarFeed, type CalendarFeedDTO } from "./prefs";

/** Subscribe-by-URL: the person's bookings, events and visitors appear in their own calendar and stay up to date. */
export function CalendarCard() {
  const [d, setD] = React.useState<CalendarFeedDTO | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { getCalendarFeed().then((r) => r.ok && setD(r.data)); }, []);
  if (!d) return null;

  const make = async () => {
    if (d.url && !window.confirm("Make a new address? The old one stops working, so you'll need to subscribe again.")) return;
    setBusy(true); setMsg(null);
    const r = await rotateCalendarFeed();
    setBusy(false);
    if (r.ok) setD(r.data);
  };
  const off = async () => { setBusy(true); await revokeCalendarFeed(); setD({ ...d, url: null }); setBusy(false); setMsg("Calendar feed turned off."); };
  const copy = async () => { try { await navigator.clipboard.writeText(d.url!); setMsg("Address copied."); } catch { setMsg("Select the address and copy it."); } };
  const webcal = d.url?.replace(/^https?:/, "webcal:");

  return (
    <Card className="space-y-3">
      <div><h2 className="font-medium">Calendar</h2><p className="text-sm text-muted">See your bookings, events and visitors in Google Calendar, Apple Calendar or Outlook. It updates by itself.</p></div>
      {!d.ready ? <p className="text-sm text-muted">This isn&apos;t available until the site&apos;s public address (AUTH_URL) is set.</p> : d.url ? (
        <>
          <div className="flex flex-wrap items-center gap-2"><code className="min-w-0 max-w-full flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{d.url}</code><Button size="sm" variant="secondary" onClick={copy}><Copy size={14} />Copy</Button></div>
          <div className="flex flex-wrap gap-2 text-sm">
            <a href={webcal} className="rounded-xl border px-3 py-1.5 font-medium hover:bg-surface-2">Add to Apple Calendar / Outlook</a>
            <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal ?? "")}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-1.5 font-medium hover:bg-surface-2">Add to Google Calendar</a>
          </div>
          <p className="text-xs text-muted">Anyone with this address can see your schedule, so keep it private. Google can take up to a day to refresh a subscribed calendar.</p>
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={make} disabled={busy}>Make a new address</Button><Button size="sm" variant="ghost" onClick={off} disabled={busy}>Turn off</Button></div>
        </>
      ) : <Button size="sm" onClick={make} disabled={busy}>Create my calendar address</Button>}
      {msg && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
    </Card>
  );
}
