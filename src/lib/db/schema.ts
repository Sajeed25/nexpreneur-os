import { sql } from "drizzle-orm";
import { bigint, boolean, date, datetime, index, customType, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ROLES } from "@/lib/rbac";

const id = () => varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const organizations = mysqlTable("organizations", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  accentColor: varchar("accent_color", { length: 9 }).default("#5b4df5"),
  legalName: varchar("legal_name", { length: 160 }),
  gstin: varchar("gstin", { length: 20 }),
  address: varchar("address", { length: 500 }),
  stateCode: varchar("state_code", { length: 2 }),
  pincode: varchar("pincode", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 190 }),
  refundApprovalPaise: bigint("refund_approval_paise", { mode: "number" }).notNull().default(1_000_000),
  require2faRoles: varchar("require_2fa_roles", { length: 200 }).notNull().default(""),
  onboardingItems: varchar("onboarding_items", { length: 120 }).notNull().default("kyc,agreement"),
  onboardingBlocks: boolean("onboarding_blocks").notNull().default(false),
  agreementText: varchar("agreement_text", { length: 4000 }),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
});

export const locations = mysqlTable("locations", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }),
  legalName: varchar("legal_name", { length: 160 }),
  gstin: varchar("gstin", { length: 20 }),
  address: varchar("address", { length: 500 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 190 }),
  logoImageId: varchar("logo_image_id", { length: 36 }),
  brandColor: varchar("brand_color", { length: 9 }),
  invoiceFooter: varchar("invoice_footer", { length: 500 }),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("loc_org").on(t.organizationId)]);

/** Staff and members who can sign in. */
export const users = mysqlTable("users", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  passwordHash: varchar("password_hash", { length: 100 }).notNull(),
  role: mysqlEnum("role", ROLES).notNull().default("member"),
  phone: varchar("phone", { length: 20 }),
  jobTitle: varchar("job_title", { length: 120 }),
  company: varchar("company", { length: 160 }),
  emergencyName: varchar("emergency_name", { length: 120 }),
  emergencyPhone: varchar("emergency_phone", { length: 20 }),
  lastLoginAt: timestamp("last_login_at"),
  passwordChangedAt: datetime("password_changed_at"),
  companyId: varchar("company_id", { length: 36 }),
  waOptIn: boolean("wa_opt_in").notNull().default(false),
  smsOptIn: boolean("sms_opt_in").notNull().default(false),
  weeklyReport: boolean("weekly_report").notNull().default(false),
  totpSecret: varchar("totp_secret", { length: 200 }),
  totpEnabledAt: datetime("totp_enabled_at"),
  calendarToken: varchar("calendar_token", { length: 40 }),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [uniqueIndex("users_email").on(t.email), index("users_org").on(t.organizationId), uniqueIndex("users_cal_token").on(t.calendarToken)]);

export const membershipPlans = mysqlTable("membership_plans", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
  billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"),
  includedDays: int("included_days"),
  bookingCredits: int("booking_credits"),
  benefits: json("benefits").$type<string[]>(),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("plan_org").on(t.organizationId)]);

export const resources = mysqlTable("resources", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  name: varchar("name", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["hot_desk", "dedicated_desk", "meeting_room", "private_office", "phone_booth", "event_space", "other"]).notNull(),
  capacity: int("capacity").notNull().default(1),
  hourlyPricePaise: bigint("hourly_price_paise", { mode: "number" }),
  dailyPricePaise: bigint("daily_price_paise", { mode: "number" }),
  status: mysqlEnum("status", ["available", "reserved", "maintenance", "unavailable"]).notNull().default("available"),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("res_org_loc").on(t.organizationId, t.locationId)]);

export const bookings = mysqlTable("bookings", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  resourceId: varchar("resource_id", { length: 36 }).notNull().references(() => resources.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  startsAt: datetime("starts_at").notNull(), // stored as UTC
  endsAt: datetime("ends_at").notNull(),
  status: mysqlEnum("status", ["confirmed", "pending", "cancelled", "completed", "no_show"]).notNull().default("confirmed"),
  subtotalPaise: bigint("subtotal_paise", { mode: "number" }).notNull(),
  taxPaise: bigint("tax_paise", { mode: "number" }).notNull(),
  totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
  creditMinutes: int("credit_minutes").notNull().default(0),
  creditPasses: int("credit_passes").notNull().default(0),
  seriesId: varchar("series_id", { length: 36 }),
  createdAt: created(),
}, (t) => [
  index("bk_series").on(t.seriesId),
  index("bk_res_time").on(t.resourceId, t.startsAt, t.endsAt),
  index("bk_org_loc_time").on(t.organizationId, t.locationId, t.startsAt),
  index("bk_user").on(t.userId),
]);

export const memberships = mysqlTable("memberships", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  planId: varchar("plan_id", { length: 36 }).notNull().references(() => membershipPlans.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  renewalDate: date("renewal_date", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "expired"]).notNull().default("active"),
  locationId: varchar("location_id", { length: 36 }),
  cancelledAt: datetime("cancelled_at"),
  creditsCycleStart: date("credits_cycle_start", { mode: "string" }),
  createdAt: created(),
}, (t) => [index("ms_org_renewal").on(t.organizationId, t.renewalDate), index("ms_user").on(t.userId)]);

export const invoices = mysqlTable("invoices", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  number: varchar("number", { length: 30 }).notNull(),
  issueDate: date("issue_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  subtotalPaise: bigint("subtotal_paise", { mode: "number" }).notNull(),
  cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
  sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
  igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
  totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
  paidPaise: bigint("paid_paise", { mode: "number" }).notNull().default(0),
  status: mysqlEnum("status", ["unpaid", "partial", "paid", "void"]).notNull().default("unpaid"),
  placeOfSupply: varchar("place_of_supply", { length: 60 }).notNull().default("Telangana"),
  buyerGstin: varchar("buyer_gstin", { length: 20 }),
  discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
  couponCode: varchar("coupon_code", { length: 40 }),
  locationId: varchar("location_id", { length: 36 }),
  companyId: varchar("company_id", { length: 36 }),
  emailedAt: datetime("emailed_at"),
  lastRemindedAt: datetime("last_reminded_at"),
  reminderCount: int("reminder_count").notNull().default(0),
  payLinkId: varchar("pay_link_id", { length: 40 }),
  payLinkUrl: varchar("pay_link_url", { length: 300 }),
  irn: varchar("irn", { length: 64 }),
  irnAckNo: varchar("irn_ack_no", { length: 30 }),
  irnAckDate: datetime("irn_ack_date"),
  irnSignedQr: text("irn_signed_qr"),
  irnStatus: varchar("irn_status", { length: 12 }),
  irnError: varchar("irn_error", { length: 300 }),
  createdAt: created(),
}, (t) => [uniqueIndex("inv_org_number").on(t.organizationId, t.number), index("inv_user").on(t.userId), index("inv_org_due").on(t.organizationId, t.dueDate)]);

export const invoiceItems = mysqlTable("invoice_items", {
  id: id(),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull().references(() => invoices.id),
  description: varchar("description", { length: 255 }).notNull(),
  hsnSac: varchar("hsn_sac", { length: 12 }).notNull().default("997212"),
  qty: int("qty").notNull().default(1),
  unitPaise: bigint("unit_paise", { mode: "number" }).notNull(),
  taxPct: int("tax_pct").notNull().default(18),
}, (t) => [index("ii_invoice").on(t.invoiceId)]);

export const payments = mysqlTable("payments", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull().references(() => invoices.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  method: mysqlEnum("method", ["cash", "upi", "bank", "card", "razorpay", "tds", "credit_note"]).notNull(),
  status: mysqlEnum("status", ["captured", "failed", "refunded"]).notNull().default("captured"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 40 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 40 }),
  refundedPaise: bigint("refunded_paise", { mode: "number" }).notNull().default(0),
  note: varchar("note", { length: 255 }),
  recordedBy: varchar("recorded_by", { length: 36 }),
  createdAt: created(),
}, (t) => [uniqueIndex("pay_rzp").on(t.razorpayPaymentId), index("pay_org_time").on(t.organizationId, t.createdAt), index("pay_invoice").on(t.invoiceId)]);

export const supportTickets = mysqlTable("support_tickets", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  subject: varchar("subject", { length: 160 }).notNull(),
  body: varchar("body", { length: 2000 }).notNull(),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  createdAt: created(),
  closedAt: timestamp("closed_at"),
}, (t) => [index("tk_org_status").on(t.organizationId, t.status), index("tk_user").on(t.userId)]);

export const visitorInvites = mysqlTable("visitor_invites", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  hostUserId: varchar("host_user_id", { length: 36 }).notNull().references(() => users.id),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  visitTime: varchar("visit_time", { length: 5 }).notNull(),
  purpose: varchar("purpose", { length: 255 }),
  token: varchar("token", { length: 40 }).notNull(),
  email: varchar("email", { length: 190 }),
  status: mysqlEnum("status", ["invited", "checked_in", "checked_out", "cancelled"]).notNull().default("invited"),
  checkedInAt: datetime("checked_in_at"),
  checkedOutAt: datetime("checked_out_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("vi_token").on(t.token), index("vi_org_date").on(t.organizationId, t.visitDate), index("vi_host").on(t.hostUserId)]);

export const LEAD_STAGES = ["new", "contacted", "tour_scheduled", "proposal_sent", "negotiation", "won", "lost"] as const;
export const leads = mysqlTable("leads", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  company: varchar("company", { length: 160 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 190 }),
  requirements: varchar("requirements", { length: 1000 }),
  interestedPlan: varchar("interested_plan", { length: 120 }),
  expectedValuePaise: bigint("expected_value_paise", { mode: "number" }).notNull().default(0),
  stage: mysqlEnum("stage", LEAD_STAGES).notNull().default("new"),
  createdAt: created(),
}, (t) => [index("lead_org_stage").on(t.organizationId, t.stage)]);

export const leadActivities = mysqlTable("lead_activities", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  leadId: varchar("lead_id", { length: 36 }).notNull().references(() => leads.id),
  kind: mysqlEnum("kind", ["note", "call", "stage"]).notNull().default("note"),
  note: varchar("note", { length: 1000 }).notNull(),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: created(),
}, (t) => [index("la_lead").on(t.leadId, t.createdAt)]);

export const events = mysqlTable("events", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 2000 }),
  startsAt: datetime("starts_at").notNull(),
  endsAt: datetime("ends_at").notNull(),
  venue: varchar("venue", { length: 160 }),
  capacity: int("capacity").notNull().default(50),
  pricePaise: bigint("price_paise", { mode: "number" }).notNull().default(0),
  organizer: varchar("organizer", { length: 120 }),
  published: boolean("published").notNull().default(false),
  imageId: varchar("image_id", { length: 36 }),
  createdAt: created(),
}, (t) => [index("ev_org_start").on(t.organizationId, t.startsAt)]);

export const eventRegistrations = mysqlTable("event_registrations", {
  id: id(),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  invoiceId: varchar("invoice_id", { length: 36 }),
  status: mysqlEnum("status", ["registered", "cancelled"]).notNull().default("registered"),
  createdAt: created(),
}, (t) => [uniqueIndex("er_event_user").on(t.eventId, t.userId)]);

export const communityPosts = mysqlTable("community_posts", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  authorId: varchar("author_id", { length: 36 }).notNull().references(() => users.id),
  kind: mysqlEnum("kind", ["update", "opportunity", "job", "question", "announcement"]).notNull().default("update"),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("cp_org_time").on(t.organizationId, t.createdAt)]);

export const communityComments = mysqlTable("community_comments", {
  id: id(),
  postId: varchar("post_id", { length: 36 }).notNull().references(() => communityPosts.id),
  authorId: varchar("author_id", { length: 36 }).notNull().references(() => users.id),
  body: varchar("body", { length: 1000 }).notNull(),
  createdAt: created(),
}, (t) => [index("cc_post").on(t.postId, t.createdAt)]);

export const communityLikes = mysqlTable("community_likes", {
  id: id(),
  postId: varchar("post_id", { length: 36 }).notNull().references(() => communityPosts.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
}, (t) => [uniqueIndex("cl_post_user").on(t.postId, t.userId)]);

export const passwordResets = mysqlTable("password_resets", {
  id: id(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at").notNull(),
  usedAt: datetime("used_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("pr_token").on(t.tokenHash), index("pr_user").on(t.userId)]);

const longblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "longblob" });

export const images = mysqlTable("images", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  mime: varchar("mime", { length: 40 }).notNull(),
  data: longblob("data").notNull(),
  createdAt: created(),
}, (t) => [index("img_org").on(t.organizationId)]);

export const companies = mysqlTable("companies", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  gstin: varchar("gstin", { length: 20 }),
  billingAddress: varchar("billing_address", { length: 500 }),
  email: varchar("email", { length: 190 }),
  phone: varchar("phone", { length: 20 }),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("co_org").on(t.organizationId)]);

export const coupons = mysqlTable("coupons", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  code: varchar("code", { length: 40 }).notNull(),
  kind: mysqlEnum("kind", ["percent", "fixed"]).notNull(),
  value: int("value").notNull(), // percent (1-100) or paise
  maxUses: int("max_uses"),
  usedCount: int("used_count").notNull().default(0),
  validUntil: date("valid_until", { mode: "string" }),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
}, (t) => [uniqueIndex("cpn_org_code").on(t.organizationId, t.code)]);

export const refunds = mysqlTable("refunds", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  paymentId: varchar("payment_id", { length: 36 }).notNull(),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  reason: varchar("reason", { length: 255 }),
  razorpayRefundId: varchar("razorpay_refund_id", { length: 40 }),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: created(),
}, (t) => [index("rf_payment").on(t.paymentId), index("rf_org_time").on(t.organizationId, t.createdAt)]);

export const services = mysqlTable("services", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: varchar("description", { length: 1000 }),
  pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
  taxPct: int("tax_pct").notNull().default(18),
  available: boolean("available").notNull().default(true),
  imageId: varchar("image_id", { length: 36 }),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("svc_org").on(t.organizationId)]);

export const serviceOrders = mysqlTable("service_orders", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  serviceId: varchar("service_id", { length: 36 }).notNull(),
  qty: int("qty").notNull().default(1),
  invoiceId: varchar("invoice_id", { length: 36 }),
  createdAt: created(),
}, (t) => [index("so_org_time").on(t.organizationId, t.createdAt), index("so_user").on(t.userId)]);

export const notifications = mysqlTable("notifications", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  kind: varchar("kind", { length: 30 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: varchar("body", { length: 500 }),
  link: varchar("link", { length: 200 }),
  readAt: datetime("read_at"),
  createdAt: created(),
}, (t) => [index("nt_user_read").on(t.userId, t.readAt, t.createdAt)]);

export const loginTokens = mysqlTable("login_tokens", {
  id: id(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at").notNull(),
  usedAt: datetime("used_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("lt_token").on(t.tokenHash), index("lt_user").on(t.userId)]);

export const auditLogs =mysqlTable("audit_logs", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  actorId: varchar("actor_id", { length: 36 }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 60 }),
  entityId: varchar("entity_id", { length: 36 }),
  createdAt: created(),
}, (t) => [index("audit_org_time").on(t.organizationId, t.createdAt)]);

// ---------- Growth pack ----------

/** Room hours (in minutes) and day passes. The balance is the sum of deltas; expiry is written as a negative entry. */
export const creditLedger = mysqlTable("credit_ledger", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  kind: mysqlEnum("kind", ["room_min", "day_pass"]).notNull(),
  delta: int("delta").notNull(),
  reason: mysqlEnum("reason", ["grant", "use", "refund", "expire", "adjust"]).notNull(),
  bookingId: varchar("booking_id", { length: 36 }),
  membershipId: varchar("membership_id", { length: 36 }),
  note: varchar("note", { length: 200 }),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: created(),
}, (t) => [index("cl_user_kind").on(t.userId, t.kind), index("cl_booking").on(t.bookingId)]);

export const bookingWaitlist = mysqlTable("booking_waitlist", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  locationId: varchar("location_id", { length: 36 }).notNull(),
  kind: varchar("kind", { length: 20 }).notNull(),
  startsAt: datetime("starts_at").notNull(),
  endsAt: datetime("ends_at").notNull(),
  status: mysqlEnum("status", ["waiting", "notified", "booked", "cancelled", "expired"]).notNull().default("waiting"),
  notifiedAt: datetime("notified_at"),
  createdAt: created(),
}, (t) => [index("wl_loc_kind").on(t.locationId, t.kind, t.status), index("wl_user").on(t.userId)]);

/** Outbound WhatsApp / SMS / web-push messages, sent by a background pass so a slow provider never blocks a request. */
export const messageOutbox = mysqlTable("message_outbox", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "sms", "push"]).notNull(),
  toAddr: varchar("to_addr", { length: 40 }),
  title: varchar("title", { length: 160 }).notNull(),
  body: varchar("body", { length: 500 }),
  link: varchar("link", { length: 200 }),
  status: mysqlEnum("status", ["queued", "sent", "failed", "skipped"]).notNull().default("queued"),
  attempts: int("attempts").notNull().default(0),
  error: varchar("error", { length: 200 }),
  providerId: varchar("provider_id", { length: 80 }),
  createdAt: created(),
  sentAt: datetime("sent_at"),
}, (t) => [index("ob_status_time").on(t.status, t.createdAt), index("ob_user").on(t.userId)]);

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  endpoint: varchar("endpoint", { length: 600 }).notNull(),
  endpointHash: varchar("endpoint_hash", { length: 64 }).notNull(),
  p256dh: varchar("p256dh", { length: 120 }).notNull(),
  auth: varchar("auth", { length: 60 }).notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("ps_endpoint").on(t.endpointHash), index("ps_user").on(t.userId)]);

export const creditNotes = mysqlTable("credit_notes", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  number: varchar("number", { length: 30 }).notNull(),
  issueDate: date("issue_date", { mode: "string" }).notNull(),
  subtotalPaise: bigint("subtotal_paise", { mode: "number" }).notNull(),
  cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
  sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
  igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
  totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
  reason: varchar("reason", { length: 255 }),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: created(),
}, (t) => [uniqueIndex("cn_org_number").on(t.organizationId, t.number), index("cn_invoice").on(t.invoiceId)]);

export const creditNoteItems = mysqlTable("credit_note_items", {
  id: id(),
  creditNoteId: varchar("credit_note_id", { length: 36 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  hsnSac: varchar("hsn_sac", { length: 12 }).notNull().default("997212"),
  qty: int("qty").notNull().default(1),
  unitPaise: bigint("unit_paise", { mode: "number" }).notNull(),
  taxPct: int("tax_pct").notNull().default(18),
}, (t) => [index("cni_note").on(t.creditNoteId)]);

export const autopayMandates = mysqlTable("autopay_mandates", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  membershipId: varchar("membership_id", { length: 36 }).notNull(),
  rzpPlanId: varchar("rzp_plan_id", { length: 40 }),
  rzpSubscriptionId: varchar("rzp_subscription_id", { length: 40 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("created"),
  shortUrl: varchar("short_url", { length: 300 }),
  createdAt: created(),
}, (t) => [uniqueIndex("am_sub").on(t.rzpSubscriptionId), index("am_membership").on(t.membershipId)]);

export const doors = mysqlTable("doors", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  locationId: varchar("location_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  active: boolean("active").notNull().default(true),
  lastSeenAt: datetime("last_seen_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("door_key").on(t.keyHash), index("door_org").on(t.organizationId)]);

export const accessCredentials = mysqlTable("access_credentials", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  identifierHash: varchar("identifier_hash", { length: 64 }).notNull(),
  label: varchar("label", { length: 60 }),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
}, (t) => [uniqueIndex("ac_hash").on(t.organizationId, t.identifierHash), index("ac_user").on(t.userId)]);

export const accessEvents = mysqlTable("access_events", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  doorId: varchar("door_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  credential: varchar("credential", { length: 10 }).notNull(),
  result: mysqlEnum("result", ["allowed", "denied"]).notNull(),
  reason: varchar("reason", { length: 80 }),
  createdAt: created(),
}, (t) => [index("ae_org_time").on(t.organizationId, t.createdAt), index("ae_user").on(t.userId)]);

export const tours = mysqlTable("tours", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  leadId: varchar("lead_id", { length: 36 }).notNull(),
  locationId: varchar("location_id", { length: 36 }).notNull(),
  startsAt: datetime("starts_at").notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show"]).notNull().default("scheduled"),
  createdAt: created(),
}, (t) => [index("tour_loc_time").on(t.locationId, t.startsAt), index("tour_lead").on(t.leadId)]);

export const memberOnboarding = mysqlTable("member_onboarding", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  item: varchar("item", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["pending", "done", "waived"]).notNull().default("pending"),
  note: varchar("note", { length: 255 }),
  refInvoiceId: varchar("ref_invoice_id", { length: 36 }),
  doneBy: varchar("done_by", { length: 36 }),
  doneAt: datetime("done_at"),
  createdAt: created(),
}, (t) => [uniqueIndex("mo_user_item").on(t.userId, t.item), index("mo_ref_invoice").on(t.refInvoiceId)]);

export const refundRequests = mysqlTable("refund_requests", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  paymentId: varchar("payment_id", { length: 36 }).notNull(),
  invoiceId: varchar("invoice_id", { length: 36 }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  reason: varchar("reason", { length: 255 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).notNull().default("pending"),
  requestedBy: varchar("requested_by", { length: 36 }).notNull(),
  decidedBy: varchar("decided_by", { length: 36 }),
  decidedAt: datetime("decided_at"),
  decisionNote: varchar("decision_note", { length: 255 }),
  createdAt: created(),
}, (t) => [index("rr_org_status").on(t.organizationId, t.status), index("rr_payment").on(t.paymentId)]);

export const recoveryCodes = mysqlTable("recovery_codes", {
  id: id(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  usedAt: datetime("used_at"),
  createdAt: created(),
}, (t) => [index("rc_user").on(t.userId)]);

export const reportRuns = mysqlTable("report_runs", {
  id: id(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("rr_user_week").on(t.userId, t.weekStart)]);

export const marketplaceListings = mysqlTable("marketplace_listings", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  authorId: varchar("author_id", { length: 36 }).notNull(),
  kind: mysqlEnum("kind", ["perk", "offer", "request"]).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 2000 }),
  priceText: varchar("price_text", { length: 80 }),
  category: varchar("category", { length: 40 }),
  perkCode: varchar("perk_code", { length: 80 }),
  link: varchar("link", { length: 300 }),
  validUntil: date("valid_until", { mode: "string" }),
  imageId: varchar("image_id", { length: 36 }),
  active: boolean("active").notNull().default(true),
  redeemCount: int("redeem_count").notNull().default(0),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("ml_org_kind").on(t.organizationId, t.kind, t.createdAt)]);

export const listingContacts = mysqlTable("listing_contacts", {
  id: id(),
  listingId: varchar("listing_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  message: varchar("message", { length: 500 }),
  createdAt: created(),
}, (t) => [index("lc_listing").on(t.listingId, t.createdAt)]);

export const perkRedemptions = mysqlTable("perk_redemptions", {
  id: id(),
  listingId: varchar("listing_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("pr_listing_user").on(t.listingId, t.userId)]);
