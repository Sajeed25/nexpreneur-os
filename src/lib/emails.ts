import "server-only";
import { rupees } from "@/lib/booking";

// Plain templates. Every dynamic value is HTML-escaped; names and descriptions come from users.
export const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const wrap = (title: string, body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1c1c1e"><h2 style="margin:0 0 16px">${esc(title)}</h2>${body}<p style="color:#888;font-size:12px;margin-top:28px">Sent by Nexpreneur OS</p></div>`;
const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#5b4df5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

export function magicLinkEmail(name: string, link: string) {
  return {
    subject: "Your Nexpreneur OS sign-in link",
    text: `Hi ${name},\n\nUse this link to sign in. It works once and expires in 15 minutes:\n${link}\n\nIf you didn't ask for it, ignore this email.\n`,
    html: wrap("Sign in", `<p>Hi ${esc(name)}, use the button to sign in. It works once and expires in 15 minutes.</p>${button(link, "Sign in")}<p style="color:#666">If you didn't ask for this, ignore this email.</p>`),
  };
}

export type InvoiceMail = {
  number: string; customer: string; issueDate: string; dueDate: string; subtotalPaise: number; discountPaise: number;
  cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; paidPaise: number;
  items: { description: string; qty: number; unitPaise: number }[]; seller: string; link: string | null;
};
export function invoiceEmail(i: InvoiceMail) {
  const due = i.totalPaise - i.paidPaise;
  const rows = i.items.map((x) => `<tr><td style="padding:6px 0">${esc(x.description)}</td><td style="text-align:right">${x.qty} × ${rupees(x.unitPaise)}</td></tr>`).join("");
  const tax = i.igstPaise ? `<tr><td>IGST</td><td style="text-align:right">${rupees(i.igstPaise)}</td></tr>` : `<tr><td>CGST</td><td style="text-align:right">${rupees(i.cgstPaise)}</td></tr><tr><td>SGST</td><td style="text-align:right">${rupees(i.sgstPaise)}</td></tr>`;
  return {
    subject: `Invoice ${i.number} from ${i.seller}`,
    text: `Hi ${i.customer},\n\nInvoice ${i.number}\nIssued ${i.issueDate}, due ${i.dueDate}\nTotal ${rupees(i.totalPaise)}; balance due ${rupees(due)}\n${i.link ? `\nView and pay: ${i.link}\n` : ""}`,
    html: wrap(`Invoice ${i.number}`, `<p>Hi ${esc(i.customer)}, here is your invoice from ${esc(i.seller)}.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd"></td></tr>
<tr><td>Subtotal</td><td style="text-align:right">${rupees(i.subtotalPaise)}</td></tr>
${i.discountPaise ? `<tr><td>Discount</td><td style="text-align:right">-${rupees(i.discountPaise)}</td></tr>` : ""}${tax}
<tr><td style="padding-top:6px"><b>Total</b></td><td style="text-align:right;padding-top:6px"><b>${rupees(i.totalPaise)}</b></td></tr>
<tr><td>Paid</td><td style="text-align:right">${rupees(i.paidPaise)}</td></tr>
<tr><td><b>Balance due</b></td><td style="text-align:right"><b>${rupees(due)}</b></td></tr></table>
<p style="color:#666">Issued ${esc(i.issueDate)} · Due ${esc(i.dueDate)}</p>${i.link ? button(i.link, due > 0 ? "View & pay" : "View invoice") : ""}`),
  };
}

export function reminderEmail(name: string, number: string, balancePaise: number, dueDate: string, overdue: boolean, link: string | null) {
  const when = overdue ? `was due on ${dueDate}` : `is due on ${dueDate}`;
  return {
    subject: overdue ? `Overdue: invoice ${number}` : `Reminder: invoice ${number} is due soon`,
    text: `Hi ${name},\n\nInvoice ${number} ${when}. Balance: ${rupees(balancePaise)}.\n${link ? `Pay or view: ${link}\n` : ""}`,
    html: wrap(overdue ? "Payment overdue" : "Payment reminder", `<p>Hi ${esc(name)}, invoice <b>${esc(number)}</b> ${esc(when)}. Balance: <b>${rupees(balancePaise)}</b>.</p>${link ? button(link, "View & pay") : ""}<p style="color:#666">If you've already paid, please ignore this.</p>`),
  };
}

export function visitorEmail(o: { visitor: string; host: string; org: string; date: string; time: string; purpose: string | null; code: string }) {
  return {
    subject: `${o.host} has invited you to ${o.org}`,
    text: `Hi ${o.visitor},\n\n${o.host} has invited you on ${o.date} at ${o.time}${o.purpose ? ` (${o.purpose})` : ""}.\nShow this code at reception: ${o.code}\n`,
    html: wrap(`You're invited to ${o.org}`, `<p>Hi ${esc(o.visitor)}, <b>${esc(o.host)}</b> has invited you.</p><p><b>${esc(o.date)}</b> at <b>${esc(o.time)}</b>${o.purpose ? ` · ${esc(o.purpose)}` : ""}</p><p>Show this QR code at reception:</p><p><img src="cid:visitor-qr" alt="QR code" width="200" height="200"></p><p style="color:#666;font-size:12px">Code: ${esc(o.code)}</p>`),
  };
}

export function welcomeEmail(name: string, org: string, link: string) {
  return {
    subject: `Welcome to ${org}: set your password`,
    text: `Hi ${name},\n\nYour ${org} account is ready. Choose your password here (the link works once and lasts 7 days):\n${link}\n\nThen sign in to book spaces, see invoices and join events.\n`,
    html: wrap(`Welcome to ${org}`, `<p>Hi ${esc(name)}, your account is ready.</p><p>Choose your password to get started. The link works once and lasts 7 days.</p>${button(link, "Set my password")}<p style="color:#666">Then sign in to book spaces, see invoices and join events.</p>`),
  };
}
