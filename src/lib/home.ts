import type { Role } from "@/lib/rbac";

/** Where each role lands after signing in. */
export const HOME: Record<Role, string> = {
  super_admin: "/dashboard", owner: "/dashboard", location_manager: "/dashboard",
  reception: "/visitors", finance: "/invoices", community_manager: "/community",
  staff: "/bookings", member: "/dashboard",
};
