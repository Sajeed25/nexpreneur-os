// Shared (client + server) booking rules. All user-facing times are India Standard Time (UTC+5:30).
export const KINDS = [
  { id: "hot_desk", label: "Hot Desk" },
  { id: "dedicated_desk", label: "Dedicated Desk" },
  { id: "meeting_room", label: "Meeting Room" },
  { id: "private_office", label: "Private Office" },
  { id: "phone_booth", label: "Phone Booth" },
  { id: "event_space", label: "Event Space" },
  { id: "other", label: "Other" },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;

export const CITY: Record<string, string | null> = { all: null, hyd: "Hyderabad", wgl: "Warangal", nlg: "Nalgonda" };
export const GST_PCT = 18;
export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 22;

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", pending: "Pending", cancelled: "Cancelled", completed: "Completed", no_show: "No Show",
};

/** 30-minute slots for the booking form, e.g. "09:30". */
export const SLOTS = Array.from({ length: (CLOSE_HOUR - OPEN_HOUR) * 2 + 1 }, (_, i) => {
  const m = OPEN_HOUR * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`;
});

export const istToDate = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

export function price(r: { hourlyPricePaise: number | null; dailyPricePaise: number | null }, start: Date, end: Date) {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  let subtotal = 0;
  if (r.hourlyPricePaise != null) subtotal = Math.round(r.hourlyPricePaise * hours);
  else if (r.dailyPricePaise != null) subtotal = r.dailyPricePaise;
  const tax = Math.round((subtotal * GST_PCT) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const priceLabel = (r: { hourlyPricePaise: number | null; dailyPricePaise: number | null }) =>
  r.hourlyPricePaise != null ? `${rupees(r.hourlyPricePaise)}/hr` : r.dailyPricePaise != null ? `${rupees(r.dailyPricePaise)}/day` : "—";

export const fmtIST = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
/** Today's date (YYYY-MM-DD) in IST. */
export const todayIST = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
