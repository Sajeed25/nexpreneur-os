"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useLocation } from "@/components/shell/app-shell";
import { cancelBooking, listBookings, listResources, seedResources, type BookingDTO, type ResourceDTO } from "./actions";
import { fmtIST, kindLabel, priceLabel, rupees, STATUS_LABEL, todayIST } from "@/lib/booking";
import { cn } from "@/lib/utils";

type Tab = "list" | "calendar" | "floor";
type Cal = "day" | "week" | "month";
const tone = (s: string) => (({ confirmed: "green", pending: "amber", cancelled: "red", completed: "blue", no_show: "grey" }) as const)[s as "confirmed"] ?? "grey";
const dayStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const addDays = (d: string, n: number) => new Date(dayStart(d).getTime() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function BookingsApp({ initialTab, canSeed }: { initialTab: Tab; canSeed: boolean }) {
  const { loc } = useLocation();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [cal, setCal] = React.useState<Cal>("week");
  const [anchor, setAnchor] = React.useState(todayIST());
  const [bookings, setBookings] = React.useState<BookingDTO[]>([]);
  const [resources, setResources] = React.useState<ResourceDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [picked, setPicked] = React.useState<ResourceDTO | null>(null);
  const [tick, setTick] = React.useState(0);
  const reload = () => setTick((t) => t + 1);

  // Visible window: list = ±60 days, calendar = its range, floor = today.
  const [from, to] = React.useMemo(() => {
    if (tab === "list") return [addDays(todayIST(), -60), addDays(todayIST(), 60)];
    if (tab === "floor") return [todayIST(), addDays(todayIST(), 1)];
    if (cal === "day") return [anchor, addDays(anchor, 1)];
    if (cal === "week") { const dow = (new Date(`${anchor}T12:00:00+05:30`).getDay() + 6) % 7; const m = addDays(anchor, -dow); return [m, addDays(m, 7)]; }
    const first = anchor.slice(0, 8) + "01"; const next = new Date(dayStart(first).getTime() + 32 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 8) + "01";
    return [first, next];
  }, [tab, cal, anchor]);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      listBookings({ loc, from: dayStart(from).toISOString(), to: dayStart(to).toISOString() }),
      listResources(loc),
    ]).then(([b, r]) => {
      if (!live) return;
      if (!b.ok) setError(b.error); else { setError(null); setBookings(b.data); }
      if (r.ok) setResources(r.data);
      setLoading(false);
    }).catch(() => { if (live) { setError("Couldn't load bookings."); setLoading(false); } });
    return () => { live = false; };
  }, [loc, from, to, tick]);

  const doCancel = async (id: string) => {
    if (!window.confirm("Cancel this booking?")) return;
    const r = await cancelBooking(id);
    if (!r.ok) setError(r.error); else reload();
  };
  const seed = async () => { const r = await seedResources(); if (!r.ok) setError(r.error); else reload(); };

  const tabs: { id: Tab; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List }, { id: "calendar", label: "Calendar", icon: CalendarDays }, { id: "floor", label: "Floor map", icon: LayoutGrid },
  ];

  return (
    <>
      <PageHeader title="Bookings" sub="Desks, rooms and spaces across your locations."
        actions={<Link href="/bookings/new"><Button><Plus size={18} />New booking</Button></Link>} />
      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-xl border bg-surface p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-sm", tab === id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="mb-4 text-sm text-muted">Loading…</p>}

      {tab === "list" && <ListView rows={bookings} onCancel={doCancel} />}
      {tab === "calendar" && <CalendarView rows={bookings} cal={cal} setCal={setCal} anchor={anchor} setAnchor={setAnchor} from={from} />}
      {tab === "floor" && (
        resources.length === 0 && !loading && !error ? (
          <div className="space-y-3">
            <EmptyState title="No resources yet" hint="Add your desks and rooms to start taking bookings." />
            {canSeed && <Button onClick={seed}>Add demo resources</Button>}
          </div>
        ) : <FloorView resources={resources} bookings={bookings} onPick={setPicked} />
      )}
      {picked && <ResourceDrawer r={picked} bookings={bookings} onClose={() => setPicked(null)} />}
    </>
  );
}

function ListView({ rows, onCancel }: { rows: BookingDTO[]; onCancel: (id: string) => void }) {
  const cols: Column<BookingDTO>[] = [
    { key: "res", header: "Resource", render: (b) => <div><p className="font-medium">{b.resourceName}</p><p className="text-xs text-muted">{kindLabel(b.kind)} · {b.city}</p></div> },
    { key: "who", header: "Booked by", render: (b) => b.who },
    { key: "when", header: "When", render: (b) => <div><p>{fmtIST(b.startsAt, { day: "numeric", month: "short", year: "numeric" })}</p><p className="text-xs text-muted">{fmtIST(b.startsAt, { hour: "numeric", minute: "2-digit" })} – {fmtIST(b.endsAt, { hour: "numeric", minute: "2-digit" })}</p></div> },
    { key: "total", header: "Total", render: (b) => rupees(b.totalPaise) },
    { key: "status", header: "Status", render: (b) => <Badge tone={tone(b.status)}>{STATUS_LABEL[b.status]}</Badge> },
    { key: "act", header: "", render: (b) => (b.status === "confirmed" || b.status === "pending") && new Date(b.endsAt) > new Date()
      ? <Button variant="secondary" size="sm" onClick={() => onCancel(b.id)}>Cancel</Button> : null },
  ];
  const search = React.useCallback((b: BookingDTO) => `${b.resourceName} ${b.who} ${b.status} ${b.city}`, []);
  return <DataTable rows={rows} columns={cols} searchText={search} />;
}

function CalendarView({ rows, cal, setCal, anchor, setAnchor, from }: {
  rows: BookingDTO[]; cal: Cal; setCal: (c: Cal) => void; anchor: string; setAnchor: (d: string) => void; from: string;
}) {
  const step = cal === "day" ? 1 : cal === "week" ? 7 : 30;
  const days = cal === "day" ? [from] : cal === "week" ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : Array.from({ length: 31 }, (_, i) => addDays(from, i)).filter((d) => d.slice(0, 7) === from.slice(0, 7));
  const live = rows.filter((b) => b.status !== "cancelled");
  const on = (d: string) => live.filter((b) => fmtIST(b.startsAt, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-") === d);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button variant="secondary" size="sm" aria-label="Previous" onClick={() => setAnchor(addDays(anchor, -step))}><ChevronLeft size={16} /></Button>
        <Button variant="secondary" size="sm" onClick={() => setAnchor(todayIST())}>Today</Button>
        <Button variant="secondary" size="sm" aria-label="Next" onClick={() => setAnchor(addDays(anchor, step))}><ChevronRight size={16} /></Button>
        <span className="ml-2 font-medium">{fmtIST(dayStart(from).toISOString(), { month: "long", year: "numeric" })}</span>
        <div className="ml-auto flex gap-1">
          {(["day", "week", "month"] as Cal[]).map((c) => (
            <button key={c} onClick={() => setCal(c)} className={cn("h-8 rounded-lg px-3 text-sm capitalize", cal === c ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2")}>{c}</button>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-px bg-border", cal === "week" ? "grid-cols-1 sm:grid-cols-7" : cal === "month" ? "grid-cols-2 sm:grid-cols-7" : "grid-cols-1")}>
        {days.map((d) => {
          const items = on(d);
          return (
            <div key={d} className={cn("min-h-28 bg-surface p-2", d === todayIST() && "bg-accent-soft")}>
              <p className="text-xs font-medium text-muted">{fmtIST(dayStart(d).toISOString(), { weekday: "short", day: "numeric" })}</p>
              <div className="mt-1 space-y-1">
                {(cal === "month" ? items.slice(0, 3) : items).map((b) => (
                  <div key={b.id} className="rounded-lg bg-accent-soft px-2 py-1 text-xs">
                    <p className="truncate font-medium text-accent">{b.resourceName}</p>
                    <p className="text-muted">{fmtIST(b.startsAt, { hour: "numeric", minute: "2-digit" })} – {fmtIST(b.endsAt, { hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                ))}
                {cal === "month" && items.length > 3 && <p className="text-xs text-muted">+{items.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const TILE: Record<string, string> = {
  available: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  booked: "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  reserved: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  maintenance: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300",
  unavailable: "border-border bg-surface-2 text-muted",
};
function nowStatus(r: ResourceDTO, bookings: BookingDTO[]) {
  if (r.status !== "available") return r.status;
  const n = Date.now();
  return bookings.some((b) => b.resourceId === r.id && (b.status === "confirmed" || b.status === "pending") && new Date(b.startsAt).getTime() <= n && new Date(b.endsAt).getTime() > n) ? "booked" : "available";
}

function FloorView({ resources, bookings, onPick }: { resources: ResourceDTO[]; bookings: BookingDTO[]; onPick: (r: ResourceDTO) => void }) {
  const groups = React.useMemo(() => {
    const m = new Map<string, ResourceDTO[]>();
    resources.forEach((r) => m.set(r.kind, [...(m.get(r.kind) ?? []), r]));
    return [...m.entries()];
  }, [resources]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.keys(TILE).map((k) => <span key={k} className="flex items-center gap-1.5 capitalize"><i className={cn("size-3 rounded border", TILE[k])} />{k}</span>)}
        <span className="text-muted">· status right now</span>
      </div>
      {groups.map(([kind, rs]) => (
        <section key={kind} className="rounded-2xl border bg-surface p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-medium text-muted">{kindLabel(kind)}s</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {rs.map((r) => {
              const st = nowStatus(r, bookings);
              return (
                <button key={r.id} onClick={() => onPick(r)} aria-label={`${r.name}, ${st}`}
                  className={cn("flex h-20 flex-col items-start justify-between rounded-xl border p-3 text-left text-sm transition hover:scale-[1.02]", TILE[st])}>
                  <span className="font-medium leading-tight">{r.name}</span>
                  <span className="text-xs capitalize opacity-80">{st}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResourceDrawer({ r, bookings, onClose }: { r: ResourceDTO; bookings: BookingDTO[]; onClose: () => void }) {
  const upcoming = bookings.filter((b) => b.resourceId === r.id && b.status === "confirmed" && new Date(b.endsAt) > new Date());
  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <aside role="dialog" aria-label={r.name} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-surface p-6 shadow-2xl">
        <button onClick={onClose} aria-label="Close" className="float-right grid size-9 place-items-center rounded-xl hover:bg-surface-2"><X size={18} /></button>
        <h2 className="text-xl font-semibold">{r.name}</h2>
        <p className="text-muted">{kindLabel(r.kind)} · {r.city}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted">Capacity</dt><dd className="font-medium">{r.capacity} {r.capacity === 1 ? "person" : "people"}</dd></div>
          <div><dt className="text-muted">Price</dt><dd className="font-medium">{priceLabel(r)}</dd></div>
          <div><dt className="text-muted">Status</dt><dd className="font-medium capitalize">{r.status}</dd></div>
        </dl>
        <h3 className="mt-6 text-sm font-medium">Today&apos;s bookings</h3>
        {upcoming.length === 0 ? <p className="mt-1 text-sm text-muted">Free for the rest of the day.</p> : (
          <ul className="mt-2 space-y-1 text-sm">{upcoming.map((b) => <li key={b.id}>{fmtIST(b.startsAt, { hour: "numeric", minute: "2-digit" })} – {fmtIST(b.endsAt, { hour: "numeric", minute: "2-digit" })}</li>)}</ul>
        )}
        <Link href={`/bookings/new?kind=${r.kind}`} className="mt-8 block"><Button className="w-full" disabled={r.status !== "available"}>Book this {kindLabel(r.kind).toLowerCase()}</Button></Link>
      </aside>
    </div>
  );
}
