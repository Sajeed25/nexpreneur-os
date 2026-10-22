"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { confirmTotpSetup, disableTotp, getSecurity, newRecoveryCodesFor, startTotpSetup, type SecurityDTO } from "../security";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

function Codes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const copy = () => navigator.clipboard?.writeText(codes.join("\n")).catch(() => {});
  return (
    <Card className="space-y-3 border-amber-500/40 bg-amber-500/5">
      <h2 className="font-medium">Save your recovery codes</h2>
      <p className="text-sm text-muted">If you lose your phone, each of these signs you in once. They are shown only now. Keep them somewhere safe, like a password manager.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">{codes.map((c) => <li key={c} className="rounded-lg bg-surface-2 px-3 py-1.5 text-center">{c}</li>)}</ul>
      <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={copy}><Copy size={14} />Copy all</Button><Button size="sm" onClick={onDone}>I&apos;ve saved them</Button></div>
    </Card>
  );
}

export function SecurityApp() {
  const [s, setS] = React.useState<SecurityDTO | null>(null);
  const [setup, setSetup] = React.useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { getSecurity().then((r) => (r.ok ? setS(r.data) : setError(r.error))); }, []);
  React.useEffect(() => { load(); }, [load]);

  if (!s) return error ? <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p> : <p className="text-sm text-muted">Loading…</p>;

  const begin = async () => { setBusy(true); setError(null); const r = await startTotpSetup(); setBusy(false); if (r.ok) setSetup(r.data); else setError(r.error); };
  const confirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await confirmTotpSetup(String(new FormData(e.currentTarget).get("code")));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSetup(null); setCodes(r.data.codes); load();
  };
  const off = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!window.confirm("Turn off two-factor sign-in?")) return;
    setBusy(true); setError(null);
    const r = await disableTotp(String(new FormData(form).get("password")));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    form.reset(); load();
  };
  const regen = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true); setError(null);
    const r = await newRecoveryCodesFor(String(new FormData(form).get("code")));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    form.reset(); setCodes(r.data.codes); load();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/profile" className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Profile</Link>
      <PageHeader title="Two-factor sign-in" sub="A code from your phone, on top of your password." />
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {!s.enabled && s.requiredByPolicy && <p role="status" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Your organisation requires two-factor sign-in for your role. Set it up below to carry on using the app.</p>}
      {codes && <Codes codes={codes} onDone={() => setCodes(null)} />}

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 className="font-medium">Authenticator app</h2><Badge tone={s.enabled ? "green" : "grey"}>{s.enabled ? "On" : "Off"}</Badge></div>
        {s.enabled ? (
          <p className="text-sm text-muted">You&apos;ll enter a code from your app each time you sign in with a password or an email link. {s.recoveryLeft} recovery code{s.recoveryLeft === 1 ? "" : "s"} left.</p>
        ) : setup ? (
          <form onSubmit={confirm} className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password).</li>
              <li>Scan this code, or type the key by hand.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="Authenticator QR code" width={180} height={180} className="rounded-xl border bg-white p-2" />
              <div className="min-w-0"><p className="text-xs text-muted">Or type this key</p><code className="block break-all rounded-lg bg-surface-2 px-2 py-1 text-sm">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></div>
            </div>
            <label className="block max-w-xs text-sm font-medium">6-digit code<input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={field} placeholder="123 456" /></label>
            <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Checking…" : "Turn on"}</Button><Button type="button" variant="secondary" onClick={() => setSetup(null)}>Cancel</Button></div>
          </form>
        ) : (
          <>
            <p className="text-sm text-muted">Protects your account even if someone learns your password. Recommended for anyone who handles money or members&apos; details.</p>
            <Button onClick={begin} disabled={busy}>{busy ? "Starting…" : "Set up an authenticator app"}</Button>
          </>
        )}
      </Card>

      {s.enabled && (
        <>
          <Card>
            <h2 className="mb-1 font-medium">New recovery codes</h2>
            <p className="mb-3 text-sm text-muted">Makes ten new codes and cancels the old ones. Enter a current code from your app to confirm it&apos;s you.</p>
            <form onSubmit={regen} className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium">6-digit code<input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={field + " w-40"} /></label>
              <Button type="submit" variant="secondary" disabled={busy}>Make new codes</Button>
            </form>
          </Card>
          {!s.requiredByPolicy && (
            <Card>
              <h2 className="mb-1 font-medium">Turn off</h2>
              <form onSubmit={off} className="flex flex-wrap items-end gap-2">
                <label className="text-sm font-medium">Your password<input name="password" type="password" required autoComplete="current-password" className={field + " w-64"} /></label>
                <Button type="submit" variant="ghost" disabled={busy}>Turn off two-factor</Button>
              </form>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
