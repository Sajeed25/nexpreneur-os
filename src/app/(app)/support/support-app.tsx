"use client";
import * as React from "react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { closeTicket, createTicket, listTickets, type TicketDTO } from "./actions";

const field = "mt-1.5 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function SupportApp({ staff }: { staff: boolean }) {
  const [rows, setRows] = React.useState<TicketDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    listTickets().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load tickets."); } });
    return () => { live = false; };
  }, [tick]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await createTicket({ subject: String(f.get("subject")), body: String(f.get("body")) });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setTick((t) => t + 1); }
  };
  const close = async (id: string) => {
    const r = await closeTicket(id);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Support" sub={staff ? "Requests from members." : "Tell us what you need and the team will help."} />
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-medium">Subject<input name="subject" required minLength={3} maxLength={160} className={field + " h-11"} placeholder="AC not working in Meeting Room A" /></label>
          <label className="block text-sm font-medium">Details<textarea name="body" required minLength={5} maxLength={2000} rows={4} className={field + " py-2"} /></label>
          <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
        </form>
      </Card>
      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No requests yet" /> : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id}><Card className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{t.subject}</p>
                <Badge tone={t.status === "open" ? "amber" : "grey"}>{t.status === "open" ? "Open" : "Closed"}</Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted">{t.body}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{staff ? `${t.who} · ` : ""}{new Date(t.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                {t.status === "open" && <Button variant="secondary" size="sm" onClick={() => close(t.id)}>Mark as closed</Button>}
              </div>
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}
