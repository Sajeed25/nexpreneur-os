"use client";
import * as React from "react";
import { Button, Card } from "@/components/ui";
import { getPrefs, removePushSubscription, savePushSubscription, sendMyReport, sendTestNotification, setPrefs, type PrefsDTO } from "./prefs";

type Msg = { kind: "ok" | "err"; text: string } | null;

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Notification preferences: WhatsApp, SMS, this device's push, and the weekly report. */
export function PrefsCard() {
  const [p, setP] = React.useState<PrefsDTO | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [busy, setBusy] = React.useState(false);
  const [thisDevice, setThisDevice] = React.useState<boolean | null>(null); // is this browser subscribed?

  const load = React.useCallback(async () => {
    const r = await getPrefs();
    if (r.ok) setP(r.data);
    if ("serviceWorker" in navigator && "PushManager" in window) {
      try { setThisDevice(!!(await (await navigator.serviceWorker.ready).pushManager.getSubscription())); } catch { setThisDevice(false); }
    } else setThisDevice(null);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (!p) return null;
  const note = (kind: "ok" | "err", text: string) => setMsg({ kind, text });

  const save = async (next: Partial<Pick<PrefsDTO, "waOptIn" | "smsOptIn" | "weeklyReport">>) => {
    setBusy(true); setMsg(null);
    const r = await setPrefs({ waOptIn: p.waOptIn, smsOptIn: p.smsOptIn, weeklyReport: p.weeklyReport, ...next });
    setBusy(false);
    if (!r.ok) return note("err", r.error);
    setP({ ...p, ...next });
    note("ok", "Saved.");
  };

  const enablePush = async () => {
    if (!p.vapidKey) return;
    setBusy(true); setMsg(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser doesn't support push notifications.");
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser settings.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(p.vapidKey) });
      const j = sub.toJSON();
      const r = await savePushSubscription({ endpoint: j.endpoint ?? "", p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" });
      if (!r.ok) { await sub.unsubscribe(); throw new Error(r.error); }
      note("ok", "Notifications are on for this device.");
      await load();
    } catch (e) { note("err", e instanceof Error ? e.message : "Couldn't turn on notifications."); }
    setBusy(false);
  };
  const disablePush = async () => {
    setBusy(true); setMsg(null);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      note("ok", "Notifications are off for this device.");
      await load();
    } catch { note("err", "Couldn't turn off notifications."); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    const r = await sendTestNotification();
    setBusy(false);
    note(r.ok ? "ok" : "err", r.ok ? "Test sent. It should arrive in a few seconds on every channel you turned on." : r.error);
  };

  const report = async () => {
    setBusy(true); setMsg(null);
    const r = await sendMyReport();
    setBusy(false);
    note(r.ok ? "ok" : "err", r.ok ? `Report for ${r.data.week} sent to your email.` : r.error);
  };

  const row = "flex items-start justify-between gap-4 py-3";
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, disabled?: boolean) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled || busy} onClick={() => set(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-primary" : "bg-border"} disabled:opacity-50`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );

  return (
    <Card>
      <h2 className="font-medium">Notifications</h2>
      <p className="text-sm text-muted">Everything also appears in the bell. Choose where else you want to hear from us.</p>
      <div className="mt-2 divide-y">
        <div className={row}>
          <div><p className="text-sm font-medium">WhatsApp</p><p className="text-sm text-muted">Invoices, reminders, renewals, payments and booking updates.{!p.whatsappReady && " Not set up on this server yet."}{p.whatsappReady && !p.phoneOk && " Add a valid mobile number above to turn this on."}</p></div>
          {toggle(p.waOptIn, (v) => save({ waOptIn: v }), "WhatsApp messages", !p.whatsappReady || (!p.phoneOk && !p.waOptIn))}
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium">SMS</p><p className="text-sm text-muted">The same updates as text messages.{!p.smsReady && " Not set up on this server yet."}{p.smsReady && !p.phoneOk && " Add a valid mobile number above to turn this on."}</p></div>
          {toggle(p.smsOptIn, (v) => save({ smsOptIn: v }), "SMS messages", !p.smsReady || (!p.phoneOk && !p.smsOptIn))}
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium">This device</p><p className="text-sm text-muted">
            {!p.pushReady ? "Push notifications aren't set up on this server yet." : thisDevice === null ? "This browser doesn't support push notifications. On iPhone, add the app to your Home Screen first." : thisDevice ? "On. You'll get a notification here even when the app is closed." : "Get a notification on this phone or computer, even when the app is closed."}
            {p.pushDevices > 0 && ` ${p.pushDevices} device${p.pushDevices > 1 ? "s" : ""} on.`}</p></div>
          {p.pushReady && thisDevice !== null && toggle(!!thisDevice, (v) => (v ? enablePush() : disablePush()), "Notifications on this device")}
        </div>
        {p.canWeekly && (
          <div className={row}>
            <div><p className="text-sm font-medium">Weekly report</p><p className="text-sm text-muted">An email every Monday morning with last week&apos;s revenue, members, bookings and what needs attention.</p></div>
            {toggle(p.weeklyReport, (v) => save({ weeklyReport: v }), "Weekly report email")}
          </div>
        )}
      </div>
      {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.kind === "err" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"}`}>{msg.text}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={test} disabled={busy}>Send me a test</Button>
        {p.canWeekly && <Button variant="secondary" size="sm" onClick={report} disabled={busy}>Send me last week&apos;s report</Button>}
      </div>
    </Card>
  );
}
