"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isRole, type Role } from "@/lib/rbac";

export type FormState = { error?: string; ok?: string };

const HOME: Record<Role, string> = {
  super_admin: "/dashboard", owner: "/dashboard", location_manager: "/dashboard",
  reception: "/visitors", finance: "/invoices", community_manager: "/community",
  staff: "/bookings", member: "/dashboard",
};

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.string().refine(isRole, "Pick a role"),
});

/**
 * DEMO AUTH — accepts any valid credentials and signs in as the chosen role.
 * Replace with supabase.auth.signInWithPassword and read the role from the staff/members table.
 */
export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, role } = parsed.data;
  const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  (await cookies()).set("nx_session", encodeURIComponent(JSON.stringify({ name, email, role })), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8,
  });
  redirect(HOME[role as Role]);
}

export async function signOut() {
  (await cookies()).delete("nx_session");
  redirect("/login");
}

const NO_BACKEND = "Supabase isn't configured yet — this flow activates once NEXT_PUBLIC_SUPABASE_URL is set.";

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ name: z.string().min(2, "Enter your name"), email: z.string().email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters") }).safeParse(Object.fromEntries(fd));
  return { error: p.success ? NO_BACKEND : p.error.issues[0].message };
}
export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.string().email("Enter a valid email").safeParse(fd.get("email"));
  return { error: p.success ? NO_BACKEND : p.error.issues[0].message };
}
export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ password: z.string().min(8, "Password must be at least 8 characters"), confirm: z.string() })
    .refine((v) => v.password === v.confirm, "Passwords don't match").safeParse(Object.fromEntries(fd));
  return { error: p.success ? NO_BACKEND : p.error.issues[0].message };
}
