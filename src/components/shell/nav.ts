import {
  LayoutDashboard, CalendarCheck, CalendarDays, Users, Building2, BadgeCheck, MapPin, Armchair,
  CreditCard, FileText, DoorOpen, Target, PartyPopper, MessagesSquare, ShoppingBag, BarChart3,
  Bot, Bell, Settings, type LucideIcon,
} from "lucide-react";
import type { Section } from "@/lib/rbac";

export const NAV: { section: Section; label: string; icon: LucideIcon; href: string }[] = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { section: "bookings", label: "Bookings", icon: CalendarCheck, href: "/bookings" },
  { section: "calendar", label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { section: "members", label: "Members", icon: Users, href: "/members" },
  { section: "companies", label: "Companies", icon: Building2, href: "/companies" },
  { section: "memberships", label: "Memberships", icon: BadgeCheck, href: "/memberships" },
  { section: "locations", label: "Locations", icon: MapPin, href: "/locations" },
  { section: "resources", label: "Resources", icon: Armchair, href: "/resources" },
  { section: "payments", label: "Payments", icon: CreditCard, href: "/payments" },
  { section: "invoices", label: "Invoices", icon: FileText, href: "/invoices" },
  { section: "visitors", label: "Visitors", icon: DoorOpen, href: "/visitors" },
  { section: "crm", label: "CRM", icon: Target, href: "/crm" },
  { section: "events", label: "Events", icon: PartyPopper, href: "/events" },
  { section: "community", label: "Community", icon: MessagesSquare, href: "/community" },
  { section: "services", label: "Services", icon: ShoppingBag, href: "/services" },
  { section: "analytics", label: "Analytics", icon: BarChart3, href: "/analytics" },
  { section: "ai", label: "AI Assistant", icon: Bot, href: "/ai" },
  { section: "notifications", label: "Notifications", icon: Bell, href: "/notifications" },
  { section: "settings", label: "Settings", icon: Settings, href: "/settings" },
];
