import "server-only";
import nodemailer from "nodemailer";

const set = (v?: string) => !!v && v !== "placeholder";
export const smtpConfigured = () => set(process.env.SMTP_HOST) && set(process.env.SMTP_USER) && set(process.env.SMTP_PASS);

/**
 * Public base URL for links in emails. It comes from configuration only, never from request headers,
 * so a forged Host header can't make a reset email point at an attacker's site.
 */
export function appUrl(): string | null {
  const u = process.env.AUTH_URL ?? "";
  if (/^https:\/\/[^/\s]+$/i.test(u) || /^http:\/\/localhost(:\d+)?$/i.test(u)) return u;
  return null;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const port = Number(process.env.SMTP_PORT) || 465;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  await t.sendMail({ from: process.env.SMTP_FROM || `Nexpreneur OS <${process.env.SMTP_USER}>`, to, subject, text, html });
}

export const resetEmail = (name: string, link: string) => ({
  subject: "Reset your Nexpreneur OS password",
  text: `Hi ${name},\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password hasn't changed.\n`,
  html: `<p>Hi ${name.replace(/[<>&"]/g, "")},</p><p><a href="${link}">Choose a new password</a>. The link works once and expires in 1 hour.</p><p style="color:#666">If you didn't ask for this, ignore this email; your password hasn't changed.</p>`,
});
