export const ROLES = [
  "super_admin", "owner", "location_manager", "reception",
  "finance", "community_manager", "staff", "member",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", owner: "Owner", location_manager: "Location Manager",
  reception: "Reception", finance: "Finance", community_manager: "Community Manager",
  staff: "Staff", member: "Member",
};

export type Section =
  | "dashboard" | "bookings" | "calendar" | "members" | "companies" | "memberships"
  | "locations" | "resources" | "payments" | "invoices" | "visitors" | "crm"
  | "events" | "community" | "services" | "analytics" | "ai" | "notifications" | "settings";

const ALL: Section[] = [
  "dashboard", "bookings", "calendar", "members", "companies", "memberships", "locations", "resources",
  "payments", "invoices", "visitors", "crm", "events", "community", "services", "analytics", "ai", "notifications", "settings",
];

export const ACCESS: Record<Role, Section[]> = {
  super_admin: ALL,
  owner: ALL,
  location_manager: ALL.filter((s) => s !== "settings"),
  reception: ["dashboard", "bookings", "calendar", "members", "visitors", "resources", "notifications"],
  finance: ["dashboard", "payments", "invoices", "analytics", "memberships", "notifications"],
  community_manager: ["dashboard", "events", "community", "members", "notifications"],
  staff: ["dashboard", "bookings", "calendar", "resources", "visitors", "notifications"],
  member: ["dashboard", "bookings", "memberships", "payments", "invoices", "events", "community", "visitors", "ai", "notifications"],
};

export const can = (role: Role, s: Section) => ACCESS[role].includes(s);
export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);
