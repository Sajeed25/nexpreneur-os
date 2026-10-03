import Link from "next/link";
import { AuthForm } from "../auth-form";
import { hasDb } from "@/lib/db/config";
import { appUrl, smtpConfigured } from "@/lib/mailer";
import { googleConfigured } from "@/lib/oauth";

export const dynamic = "force-dynamic"; // DATABASE_URL and keys are read at request time, not baked in at build

const ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Please try again, or use your password.",
  google_busy: "Too many sign-in attempts. Try again in a few minutes.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ reset?: string; error?: string }> }) {
  const { reset, error } = await searchParams;
  const live = hasDb() && !!appUrl();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-muted">Sign in to Nexpreneur OS.</p>
      {reset === "1" && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">Password updated. Sign in with your new password.</p>}
      {error && ERRORS[error] && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{ERRORS[error]}</p>}
      <AuthForm kind="login" demo={!hasDb()} magic={live && smtpConfigured()} google={live && googleConfigured()} />
      <p className="mt-6 text-center text-sm text-muted">New here? <Link href="/register" className="text-accent hover:underline">Create an account</Link></p>
    </>
  );
}
