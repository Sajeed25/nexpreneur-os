// iCalendar (.ics) files for bookings, events, visits and tours. Pure functions: no database, no network.

export type IcsEvent = {
  uid: string; title: string; start: Date; end: Date;
  description?: string | null; location?: string | null; url?: string | null;
  /** CANCELLED tells a calendar to remove an event it already has (same uid). */
  status?: "CONFIRMED" | "CANCELLED"; remindMinutes?: number | null; sequence?: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** 20261021T093000Z */
export const icsDate = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Escapes text values: backslash, semicolon, comma and newlines. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes are folded (CRLF + one space), without splitting a multi-byte character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ""; bytes = 0; limit = 74; } // continuation lines carry a leading space
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], opts: { name?: string; method?: "PUBLISH" | "REQUEST" | "CANCEL" } = {}): string {
  const now = icsDate(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexpreneur OS//Calendar//EN", "CALSCALE:GREGORIAN", `METHOD:${opts.method ?? "PUBLISH"}`];
  if (opts.name) lines.push(`X-WR-CALNAME:${icsText(opts.name)}`);
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end)}`, `SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.status ?? "CONFIRMED"}`, `SEQUENCE:${e.sequence ?? 0}`, "TRANSP:OPAQUE");
    if (e.remindMinutes && e.status !== "CANCELLED") lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${Math.round(e.remindMinutes)}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "Add to calendar" links that need no file. Times are UTC. */
export function googleCalendarUrl(e: Pick<IcsEvent, "title" | "start" | "end" | "description" | "location">) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.start)}/${icsDate(e.end)}` });
  if (e.description) q.set("details", e.description);
  if (e.location) q.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${q}`;
}
export function outlookCalendarUrl(e: Pick<IcsEvent, "title" | "start" | "end" | "description" | "location">) {
  const q = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: e.start.toISOString(), enddt: e.end.toISOString() });
  if (e.description) q.set("body", e.description);
  if (e.location) q.set("location", e.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q}`;
}
