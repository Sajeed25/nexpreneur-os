"use client";
import * as React from "react";
import QRCode from "qrcode";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { SLOTS, fmtIST, todayIST } from "@/lib/booking";
import { inviteVisitor, listVisitors, updateVisitor, type VisitorDTO } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
const TONE = { invited: "amber", checked_in: "green", checked_out: "grey", cancelled: "red" } as const;
const LABEL = { invited: "Expected", checked_in: "Checked in", checked_out: "Checked out", cancelled: "Cancelled" } as const;

function Qr({ token }: { token: string }) {
  const [src, setSrc] = React.useState("");
  React.useEffect(() => { QRCode.toDataURL(token, { width: 220, margin: 1 }).then(setSrc).catch(() => setSrc("")); }, [token]);
  return src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="Visitor QR code" width={220} height={220} className="rounded-xl border bg-white p-2" /> : <div className="size-[220px] rounded-xl bg-surface-2" />;
}

export function VisitorsApp({ desk }: { desk: boolean }) {
  const [rows, setRows] = React.useState<VisitorDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [shown, setShown] = React.useState<{ name: string; token: string } | null>(null);
  const [showForm, setShowForm] = React.useState(!desk);
  const today = todayIST();

  React.useEffect(() => {
    let live = true;
    listVisitors().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load visitors."); } });
    return () => { live = false; };
  }, [tick]);

  const invite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await inviteVisitor({ name: String(f.get("name")), phone: String(f.get("phone")), date: String(f.get("date")), time: String(f.get("time")), purpose: String(f.get("purpose")) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setShown({ name: String(f.get("name")), token: r.data.token }); form.reset(); setTick((t) => t + 1);
  };
  const run = async (input: Parameters<typeof updateVisitor>[0], done: string) => {
    setError(null); setInfo(null);
    const r = await updateVisitor(input);
    if (!r.ok) setError(r.error); else { setInfo(`${r.data.name}: ${done}`); setTick((t) => t + 1); }
  };
  const scan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(new FormData(form).get("code")).trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(code)) { setError("That doesn't look like a visitor code"); return; }
    run({ token: code, action: "check_in" }, "checked in").then(() => form.reset());
  };

  const todays = rows.filter((v) => v.date === today);
  const later = rows.filter((v) => v.date !== today);

  const Row = ({ v }: { v: VisitorDTO }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">{v.name} <Badge tone={TONE[v.status as keyof typeof TONE]}>{LABEL[v.status as keyof typeof LABEL]}</Badge></p>
        <p className="text-sm text-muted">Host {v.host} · {v.date === today ? "Today" : v.date} {v.time}{v.purpose ? ` · ${v.purpose}` : ""}</p>
        {v.checkedInAt && <p className="text-xs text-muted">In {fmtIST(v.checkedInAt, { hour: "numeric", minute: "2-digit" })}{v.checkedOutAt ? ` · Out ${fmtIST(v.checkedOutAt, { hour: "numeric", minute: "2-digit" })}` : ""}</p>}
      </div>
      <div className="flex gap-2">
        {v.status === "invited" && <Button variant="secondary" size="sm" onClick={() => setShown({ name: v.name, token: v.token })}>Show QR</Button>}
        {desk && v.status === "invited" && v.date === today && <Button size="sm" onClick={() => run({ id: v.id, action: "check_in" }, "checked in")}>Check in</Button>}
        {desk && v.status === "checked_in" && <Button size="sm" onClick={() => run({ id: v.id, action: "check_out" }, "checked out")}>Check out</Button>}
        {v.status === "invited" && <Button variant="ghost" size="sm" onClick={() => run({ id: v.id, action: "cancel" }, "invitation cancelled")}>Cancel</Button>}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader title="Visitors" sub={desk ? "Today's arrivals and invitations." : "Invite guests and share their QR code."}
        actions={desk && <Button onClick={() => setShowForm(!showForm)}>Invite visitor</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      {desk && (
        <Card className="mb-6">
          <form onSubmit={scan} className="flex flex-wrap items-end gap-3">
            <label className="min-w-60 flex-1 text-sm font-medium">Check in by code<input name="code" className={field} placeholder="Paste or scan the visitor's code" autoComplete="off" /></label>
            <Button type="submit">Check in</Button>
          </form>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={invite} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Visitor name<input name="name" required minLength={2} maxLength={160} className={field} /></label>
            <label className="text-sm font-medium">Phone<input name="phone" type="tel" maxLength={20} className={field} /></label>
            <label className="text-sm font-medium">Date<input name="date" type="date" min={today} defaultValue={today} required className={field} /></label>
            <label className="text-sm font-medium">Time<select name="time" defaultValue="10:00" className={field}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-sm font-medium sm:col-span-2">Purpose<input name="purpose" maxLength={255} className={field} placeholder="Client meeting" /></label>
            <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Creating…" : "Generate QR invitation"}</Button>
          </form>
        </Card>
      )}

      {shown && (
        <Card className="mb-6 flex flex-wrap items-center gap-6">
          <Qr token={shown.token} />
          <div className="min-w-0 space-y-2">
            <p className="text-lg font-semibold">{shown.name}</p>
            <p className="text-sm text-muted">Show this QR code (or the code below) at reception.</p>
            <code className="block break-all rounded-lg bg-surface-2 px-2 py-1 text-xs">{shown.token}</code>
            <p className="text-xs text-muted">Sending the invite by email or WhatsApp is coming soon. For now, screenshot this and share it.</p>
            <Button variant="secondary" size="sm" onClick={() => setShown(null)}>Close</Button>
          </div>
        </Card>
      )}

      <h2 className="mb-1 font-medium">{desk ? "Today" : "Your visitors today"}</h2>
      {loading ? <p className="text-sm text-muted">Loading…</p> : todays.length === 0 ? <EmptyState title="No visitors today" /> : <Card className="py-1"><ul className="divide-y">{todays.map((v) => <Row key={v.id} v={v} />)}</ul></Card>}
      {later.length > 0 && <>
        <h2 className="mb-1 mt-6 font-medium">Other days</h2>
        <Card className="py-1"><ul className="divide-y">{later.map((v) => <Row key={v.id} v={v} />)}</ul></Card>
      </>}
    </>
  );
}
