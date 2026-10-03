"use client";
import * as React from "react";
import Link from "next/link";
import { Armchair, CalendarCheck, DoorOpen, PartyPopper, Ticket } from "lucide-react";
import { Card } from "@/components/ui";
import { getMemberHome, type MemberHomeDTO } from "./actions";
import { fmtIST, rupees } from "@/lib/booking";

const ACTIONS = [
  { label: "Book Desk", icon: Armchair, href: "/bookings/new?kind=hot_desk" },
  { label: "Meeting Room", icon: CalendarCheck, href: "/bookings/new?kind=meeting_room" },
  { label: "Day Pass", icon: Ticket, href: "/bookings/new?kind=hot_desk" },
  { label: "Invite Visitor", icon: DoorOpen, href: "/visitors" },
  { label: "Events", icon: PartyPopper, href: "/events" },
];
const CYCLE: Record<string, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function MemberHome({ name }: { name: string }) {
  const [d, setD] = React.useState<MemberHomeDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    getMemberHome().then((r) => (r.ok ? setD(r.data) : setError(r.error))).catch(() => setError("Couldn't load your home."));
  }, []);

  const b = d?.nextBooking;
  const day = b && fmtIST(b.startsAt, { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{greeting()}, {name}</h1>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <Card>
        <p className="text-sm text-muted">Upcoming booking</p>
        {!d ? <p className="mt-1 text-muted">Loading…</p> : b ? (
          <>
            <p className="mt-1 text-xl font-semibold">{b.name}</p>
            <p className="text-muted">{day} · {fmtIST(b.startsAt, { hour: "numeric", minute: "2-digit" })} – {fmtIST(b.endsAt, { hour: "numeric", minute: "2-digit" })}</p>
          </>
        ) : (
          <p className="mt-1 text-muted">Nothing booked. <Link href="/bookings/new" className="font-medium text-accent hover:underline">Book a space</Link></p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ACTIONS.map(({ label, icon: Icon, href }) => (
          <Link key={label} href={href} className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-surface text-sm font-medium shadow-soft transition hover:border-accent">
            <Icon size={22} className="text-accent" />{label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-primary text-primary-fg">
          <p className="text-sm opacity-80">Your membership</p>
          {!d ? <p className="mt-1 opacity-80">Loading…</p> : d.membership ? (
            <>
              <p className="mt-1 text-xl font-semibold">{d.membership.plan} · {rupees(d.membership.pricePaise)}/{CYCLE[d.membership.cycle]}</p>
              <p className="opacity-80">Renews {new Date(`${d.membership.renewalDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            </>
          ) : <p className="mt-1 opacity-90">No active plan yet. Ask reception to start one.</p>}
        </Card>
        <Link href="/invoices">
          <Card className="h-full transition hover:border-accent">
            <p className="text-sm text-muted">Outstanding</p>
            <p className="mt-1 text-xl font-semibold">{d ? rupees(d.owedPaise) : "…"}</p>
            <p className="text-sm text-muted">{d && d.owedPaise > 0 ? "View and pay your invoices" : "You're all paid up"}</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
