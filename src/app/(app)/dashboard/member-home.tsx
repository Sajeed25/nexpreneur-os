import Link from "next/link";
import { Armchair, CalendarCheck, DoorOpen, PartyPopper, Ticket } from "lucide-react";
import { Card } from "@/components/ui";

const ACTIONS = [
  { label: "Book Desk", icon: Armchair, href: "/bookings" },
  { label: "Meeting Room", icon: CalendarCheck, href: "/bookings" },
  { label: "Day Pass", icon: Ticket, href: "/bookings" },
  { label: "Invite Visitor", icon: DoorOpen, href: "/visitors" },
  { label: "Events", icon: PartyPopper, href: "/events" },
];

export function MemberHome({ name }: { name: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Good morning, {name}</h1>
      <Card>
        <p className="text-sm text-muted">Upcoming booking</p>
        <p className="mt-1 text-xl font-semibold">Meeting Room A</p>
        <p className="text-muted">Today · 10:00 AM – 12:00 PM</p>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ACTIONS.map(({ label, icon: Icon, href }) => (
          <Link key={label} href={href} className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-surface text-sm font-medium shadow-soft transition hover:border-accent">
            <Icon size={22} className="text-accent" />{label}
          </Link>
        ))}
      </div>
      <Card className="bg-accent text-accent-fg">
        <p className="text-sm opacity-80">Your membership</p>
        <p className="mt-1 text-xl font-semibold">Nexpreneur Flexi · ₹3,999/month</p>
        <p className="opacity-80">Renews 25 October 2026</p>
      </Card>
    </div>
  );
}
