import { sql } from "drizzle-orm";
import { bigint, boolean, date, datetime, index, customType, int, json, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ROLES } from "@/lib/rbac";

const id = () => varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const organizations = mysqlTable("organizations", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  accentColor: varchar("accent_color", { length: 9 }).default("#5b4df5"),
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
});

export const locations = mysqlTable("locations", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }),
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
  createdAt: created(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [uniqueIndex("users_email").on(t.email), index("users_org").on(t.organizationId)]);

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
  createdAt: created(),
}, (t) => [
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
  method: mysqlEnum("method", ["cash", "upi", "bank", "card", "razorpay"]).notNull(),
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
