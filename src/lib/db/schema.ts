import { sql } from "drizzle-orm";
import { bigint, datetime, index, int, json, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
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
  lastLoginAt: timestamp("last_login_at"),
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

export const auditLogs =mysqlTable("audit_logs", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull(),
  actorId: varchar("actor_id", { length: 36 }),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 60 }),
  entityId: varchar("entity_id", { length: 36 }),
  createdAt: created(),
}, (t) => [index("audit_org_time").on(t.organizationId, t.createdAt)]);
