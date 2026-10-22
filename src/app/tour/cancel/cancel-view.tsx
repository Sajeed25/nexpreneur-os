"use client";
import * as React from "react";
import { Button } from "@/components/ui";
import { cancelTourByToken, type TourView } from "../actions";

export function CancelView({ token, tour }: { token: string; tour: TourView }) {
  const [status, setStatus] = React.useState(tour.status);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cancel = async () => {
    setBusy(true); setError(null);
    const r = await cancelTourByToken(token);
    setBusy(false);
    if (r.ok) setStatus("cancelled"); else setError(r.error);
  };
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{status === "cancelled" ? "Your tour is cancelled" : "Your tour"}</h1>
      <p className="text-lg font-medium">{tour.when}</p>
      <p className="text-muted">{tour.org} {tour.location}</p>
      {status === "cancelled" && <p className="text-sm text-muted">You&apos;re welcome to book another time whenever you like.</p>}
      {status === "scheduled" && tour.cancellable && <Button variant="secondary" onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel this tour"}</Button>}
      {status === "scheduled" && !tour.cancellable && <p className="text-sm text-muted">This tour can&apos;t be changed online any more.</p>}
      {status === "completed" && <p className="text-sm text-muted">This tour has taken place.</p>}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
