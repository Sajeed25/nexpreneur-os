"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isGstin, stateCodeOf, STATE_CODES } from "@/lib/gst";
import { ROLES, type Role } from "@/lib/rbac";
import { ONBOARDING_ITEMS, DEFAULT_AGREEMENT } from "@/lib/onboarding-items";
import { smtpConfigured, appUrl } from "@/lib/mailer";
import { outboxStats, pushConfigured, smsConfigured, whatsappConfigured } from "@/lib/messaging";
import { rzpKeys } from "@/lib/payments-server";
import { einvoiceConfigured } from "@/lib/einvoice-server";

const { organizations, auditLogs } = schema;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const NO = "Sign in with a real account.";
const OWNERS = ["super_admin", "owner"];

async function ctx() {
  const s = await getSession();
  return s && !s.demo && hasDb() && s.role !== "member" && OWNERS.includes(s.role) ? s : null;
}

export type BusinessDTO = { name: string; legalName: string; gstin: string; address: string; stateCode: string; pincode: string; phone: string; email: string; states: { code: string; name: string }[] };

export async function getBusiness(): Promise<Result<BusinessDTO>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const [o] = await db().select().from(organizations).where(eq(organizations.id, s.org));
  if (!o) return { ok: false, error: "Organisation not found" };
  return { ok: true, data: { name: o.name, legalName: o.legalName ?? "", gstin: o.gstin ?? "", address: o.address ?? "", stateCode: o.stateCode ?? "", pincode: o.pincode ?? "", phone: o.phone ?? "", email: o.email ?? "", states: Object.entries(STATE_CODES).map(([code, name]) => ({ code, name })) } };
}

const businessIn = z.object({
  legalName: z.string().trim().max(160),
  gstin: z.string().trim().toUpperCase().max(15).refine((v) => v === "" || isGstin(v), "That GSTIN isn't valid. It has 15 characters, like 36AABCN1234F1Z5."),
  address: z.string().trim().max(500),
  pincode: z.string().trim().refine((v) => v === "" || /^[1-9]\d{5}$/.test(v), "PIN code must be 6 digits"),
  stateCode: z.string().trim().refine((v) => v === "" || v in STATE_CODES, "Pick a state"),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Phone can only have digits, spaces, + - ( )"),
  email: z.string().trim().max(190).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
});

/** Business details printed on invoices and sent in e-invoices. The state comes from the GSTIN when there is one. */
export async function saveBusiness(input: z.infer<typeof businessIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = businessIn.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the details" };
  const v = p.data;
  const stateCode = stateCodeOf(v.gstin) ?? (v.stateCode || null);
  await db().update(organizations).set({ legalName: v.legalName || null, gstin: v.gstin || null, address: v.address || null, pincode: v.pincode || null, stateCode, phone: v.phone || null, email: v.email || null }).where(eq(organizations.id, s.org));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "business.update", entity: "organization", entityId: s.org });
  return { ok: true, data: null };
}

// ---------- Policies ----------
const TWO_FA_ROLES = ROLES.filter((r) => r !== "member");
export type PoliciesDTO = {
  refundApprovalRupees: number; require2faRoles: string[]; twoFaRoles: { id: string; label: string }[];
  onboardingItems: string[]; onboardingBlocks: boolean; agreementText: string; agreementDefault: string; items: { id: string; label: string }[];
};

export async function getPolicies(): Promise<Result<PoliciesDTO>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const [o] = await db().select().from(organizations).where(eq(organizations.id, s.org));
  if (!o) return { ok: false, error: "Organisation not found" };
  const { ROLE_LABEL } = await import("@/lib/rbac");
  return { ok: true, data: {
    refundApprovalRupees: Math.round(o.refundApprovalPaise / 100), require2faRoles: o.require2faRoles ? o.require2faRoles.split(",") : [],
    twoFaRoles: TWO_FA_ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r as Role] })),
    onboardingItems: o.onboardingItems ? o.onboardingItems.split(",") : [], onboardingBlocks: o.onboardingBlocks,
    agreementText: o.agreementText ?? "", agreementDefault: DEFAULT_AGREEMENT, items: ONBOARDING_ITEMS.map((i) => ({ id: i.id, label: i.label })),
  } };
}

const policiesIn = z.object({
  refundApprovalRupees: z.number().int().min(0).max(10_000_000),
  require2faRoles: z.array(z.enum(TWO_FA_ROLES as [string, ...string[]])).max(20),
  onboardingItems: z.array(z.enum(ONBOARDING_ITEMS.map((i) => i.id) as [string, ...string[]])).max(10),
  onboardingBlocks: z.boolean(),
  agreementText: z.string().max(4000),
});

export async function savePolicies(input: z.infer<typeof policiesIn>): Promise<Result<null>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const p = policiesIn.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the policy settings" };
  const v = p.data;
  await db().update(organizations).set({
    refundApprovalPaise: v.refundApprovalRupees * 100, require2faRoles: [...new Set(v.require2faRoles)].join(","),
    onboardingItems: [...new Set(v.onboardingItems)].join(","), onboardingBlocks: v.onboardingBlocks, agreementText: v.agreementText.trim() || null,
  }).where(eq(organizations.id, s.org));
  await db().insert(auditLogs).values({ organizationId: s.org, actorId: s.uid, action: "policies.update", entity: "organization", entityId: s.org });
  return { ok: true, data: null };
}

// ---------- Integrations (status only, never secrets) ----------
export type IntegrationDTO = { id: string; name: string; ok: boolean; detail: string };
export type IntegrationsData = { items: IntegrationDTO[]; outbox: { channel: string; status: string; n: number }[] };

export async function getIntegrations(): Promise<Result<IntegrationsData>> {
  const s = await ctx();
  if (!s) return { ok: false, error: NO };
  const set = (v?: string) => !!v && v !== "placeholder";
  const items: IntegrationDTO[] = [
    { id: "url", name: "Public address (AUTH_URL)", ok: !!appUrl(), detail: appUrl() ? "Links in emails use it." : "Not set. Password reset and invoice links need it." },
    { id: "email", name: "Email (SMTP)", ok: smtpConfigured(), detail: smtpConfigured() ? "Invoices, reminders and weekly reports can be emailed." : "Not set. Add SMTP_HOST, SMTP_USER and SMTP_PASS." },
    { id: "razorpay", name: "Online payments (Razorpay)", ok: !!rzpKeys(), detail: rzpKeys() ? (set(process.env.RAZORPAY_WEBHOOK_SECRET) ? "Keys and webhook secret are set. Payment links and autopay are available." : "Keys are set, but RAZORPAY_WEBHOOK_SECRET isn't: payment links and autopay need the webhook.") : "Not set. Add the Razorpay keys." },
    { id: "whatsapp", name: "WhatsApp", ok: whatsappConfigured(), detail: whatsappConfigured() ? "Members who opted in get invoices and reminders on WhatsApp." : "Not set. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (and an approved template)." },
    { id: "sms", name: "SMS", ok: smsConfigured(), detail: smsConfigured() ? "Members who opted in get SMS." : "Not set. Add MSG91_AUTH_KEY and MSG91_TEMPLATE_ID." },
    { id: "push", name: "Push notifications", ok: pushConfigured(), detail: pushConfigured() ? "Members can turn on notifications on their devices." : "Not set. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." },
    { id: "einvoice", name: "e-Invoicing (IRN)", ok: einvoiceConfigured(), detail: einvoiceConfigured() ? "Finance can generate IRNs from an invoice." : "Not set. Add EINV_API_URL and EINV_API_TOKEN (your GSP or gateway)." },
    { id: "cron", name: "Daily job", ok: set(process.env.CRON_SECRET) && (process.env.CRON_SECRET ?? "").length >= 16, detail: "Renewals, reminders, credits and weekly reports run when /api/cron/daily is called once a day." },
    { id: "ai", name: "AI assistant", ok: set(process.env.OPENAI_API_KEY), detail: set(process.env.OPENAI_API_KEY) ? "On." : "Not set. Add OPENAI_API_KEY." },
    { id: "google", name: "Google sign-in", ok: set(process.env.GOOGLE_CLIENT_ID) && set(process.env.GOOGLE_CLIENT_SECRET), detail: "Optional." },
    { id: "sso", name: "Single sign-on (OIDC)", ok: set(process.env.OIDC_ISSUER) && set(process.env.OIDC_CLIENT_ID) && set(process.env.OIDC_CLIENT_SECRET), detail: "Optional. Works with Microsoft Entra ID, Google Workspace, Okta and others." },
  ];
  return { ok: true, data: { items, outbox: (await outboxStats(s.org)).map((r) => ({ channel: r.channel, status: r.status, n: Number(r.n) })) } };
}
