import "server-only";
import { rupees } from "@/lib/booking";
import { button, esc, wrap } from "@/lib/emails";

// Templates for the growth-pack features. Same rules as emails.ts: every dynamic value is escaped.

export function payLinkEmail(o: { name: string; number: string; amountPaise: number; dueDate: string; url: string; seller: string }) {
  return {
    subject: `Pay invoice ${o.number} (${rupees(o.amountPaise)})`,
    text: `Hi ${o.name},\n\nYou can pay invoice ${o.number} (${rupees(o.amountPaise)}, due ${o.dueDate}) securely with UPI, card or net banking:\n${o.url}\n\nThanks, ${o.seller}\n`,
    html: wrap(`Pay invoice ${o.number}`, `<p>Hi ${esc(o.name)}, you can pay <b>${rupees(o.amountPaise)}</b> (due ${esc(o.dueDate)}) securely with UPI, card or net banking.</p>${button(o.url, `Pay ${rupees(o.amountPaise)}`)}<p style="color:#666">From ${esc(o.seller)}. If you've already paid, ignore this email.</p>`),
  };
}

export function tourConfirmEmail(o: { name: string; org: string; location: string; address: string | null; when: string; cancelUrl: string | null; ics?: boolean }) {
  return {
    subject: `Your tour at ${o.org} is booked: ${o.when}`,
    text: `Hi ${o.name},\n\nYour tour of ${o.org} ${o.location} is booked for ${o.when}.${o.address ? `\nAddress: ${o.address}` : ""}\n${o.cancelUrl ? `\nNeed to change it? ${o.cancelUrl}\n` : ""}\nSee you soon!\n`,
    html: wrap("Your tour is booked", `<p>Hi ${esc(o.name)}, we're looking forward to showing you around <b>${esc(o.org)} ${esc(o.location)}</b>.</p><p style="font-size:18px"><b>${esc(o.when)}</b></p>${o.address ? `<p>${esc(o.address)}</p>` : ""}${o.ics ? `<p style="color:#666">A calendar invite is attached.</p>` : ""}${o.cancelUrl ? button(o.cancelUrl, "Change or cancel") : ""}`),
  };
}

export function bookingConfirmEmail(o: { name: string; space: string; when: string; totalText: string; creditsText: string | null }) {
  return {
    subject: `Booking confirmed: ${o.space}, ${o.when}`,
    text: `Hi ${o.name},\n\nYour booking is confirmed.\n${o.space}\n${o.when}\n${o.totalText}${o.creditsText ? `\n${o.creditsText}` : ""}\n\nA calendar invite is attached.\n`,
    html: wrap("Booking confirmed", `<p>Hi ${esc(o.name)}, your booking is confirmed.</p><p style="font-size:18px"><b>${esc(o.space)}</b><br>${esc(o.when)}</p><p>${esc(o.totalText)}${o.creditsText ? `<br><span style="color:#2a7a3b">${esc(o.creditsText)}</span>` : ""}</p><p style="color:#666">A calendar invite is attached.</p>`),
  };
}

export type WeeklyReport = {
  org: string; weekLabel: string;
  revenuePaise: number; prevRevenuePaise: number; newMembers: number; prevNewMembers: number; bookings: number; prevBookings: number;
  occupancyPct: number; outstandingPaise: number; overdueCount: number; overduePaise: number; renewalsNext7: number; refundsPending: number;
  link: string | null;
};
const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? "no change" : "new") : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`);

export function weeklyReportEmail(r: WeeklyReport) {
  const row = (label: string, value: string, change?: string) =>
    `<tr><td style="padding:8px 0;color:#555">${esc(label)}</td><td style="text-align:right;padding:8px 0"><b>${esc(value)}</b>${change ? ` <span style="color:#888;font-size:12px">${esc(change)}</span>` : ""}</td></tr>`;
  const attention = [
    r.overdueCount ? `${r.overdueCount} overdue invoice${r.overdueCount > 1 ? "s" : ""} (${rupees(r.overduePaise)})` : "",
    r.refundsPending ? `${r.refundsPending} refund${r.refundsPending > 1 ? "s" : ""} waiting for approval` : "",
    r.renewalsNext7 ? `${r.renewalsNext7} renewal${r.renewalsNext7 > 1 ? "s" : ""} in the next 7 days` : "",
  ].filter(Boolean);
  return {
    subject: `${r.org} weekly report: ${r.weekLabel}`,
    text: [`${r.org}: ${r.weekLabel}`, ``, `Revenue collected: ${rupees(r.revenuePaise)} (${delta(r.revenuePaise, r.prevRevenuePaise)})`, `New members: ${r.newMembers} (${delta(r.newMembers, r.prevNewMembers)})`, `Bookings: ${r.bookings} (${delta(r.bookings, r.prevBookings)})`, `Occupancy: ${r.occupancyPct}%`, `Outstanding: ${rupees(r.outstandingPaise)}`, ``, attention.length ? `Needs attention:\n- ${attention.join("\n- ")}` : "Nothing needs attention.", r.link ? `\nOpen the dashboard: ${r.link}` : ""].join("\n"),
    html: wrap(`${r.org}: ${r.weekLabel}`, `<table style="width:100%;border-collapse:collapse;font-size:15px">${row("Revenue collected", rupees(r.revenuePaise), delta(r.revenuePaise, r.prevRevenuePaise))}${row("New members", String(r.newMembers), delta(r.newMembers, r.prevNewMembers))}${row("Bookings", String(r.bookings), delta(r.bookings, r.prevBookings))}${row("Occupancy", `${r.occupancyPct}%`)}${row("Outstanding", rupees(r.outstandingPaise))}</table>${attention.length ? `<p style="margin-top:20px"><b>Needs attention</b></p><ul style="padding-left:18px;color:#444">${attention.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<p style="color:#2a7a3b;margin-top:20px">Nothing needs attention this week.</p>`}${r.link ? button(r.link, "Open the dashboard") : ""}<p style="color:#888;font-size:12px">Revenue and members compare with the week before. Turn this email off under Profile > Notifications.</p>`),
  };
}

export function refundApprovalEmail(o: { approver: string; requester: string; invoice: string; amountPaise: number; reason: string | null; link: string | null }) {
  return {
    subject: `Refund approval needed: ${rupees(o.amountPaise)} on ${o.invoice}`,
    text: `Hi ${o.approver},\n\n${o.requester} asked to refund ${rupees(o.amountPaise)} on invoice ${o.invoice}.${o.reason ? `\nReason: ${o.reason}` : ""}\n${o.link ? `\nReview it: ${o.link}\n` : ""}`,
    html: wrap("Refund approval needed", `<p>Hi ${esc(o.approver)}, <b>${esc(o.requester)}</b> asked to refund <b>${rupees(o.amountPaise)}</b> on invoice ${esc(o.invoice)}.</p>${o.reason ? `<p>Reason: ${esc(o.reason)}</p>` : ""}${o.link ? button(o.link, "Review the request") : ""}`),
  };
}
