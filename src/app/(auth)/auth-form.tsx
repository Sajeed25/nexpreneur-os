"use client";
import * as React from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { ROLES, ROLE_LABEL } from "@/lib/rbac";
import { forgotPassword, register, resetPassword, signIn, type FormState } from "./actions";

type Kind = "login" | "register" | "forgot" | "reset";
const CFG = {
  login: { action: signIn, cta: "Sign in" },
  register: { action: register, cta: "Create account" },
  forgot: { action: forgotPassword, cta: "Send reset link" },
  reset: { action: resetPassword, cta: "Update password" },
} as const;

export function AuthForm({ kind }: { kind: Kind }) {
  const [state, act, pending] = React.useActionState<FormState, FormData>(CFG[kind].action, {});
  return (
    <form action={act} className="space-y-4" noValidate>
      {kind === "register" && <Input name="name" label="Full name" autoComplete="name" />}
      {kind !== "reset" && <Input name="email" type="email" label="Email" autoComplete="email" placeholder="you@company.in" />}
      {kind !== "forgot" && <Input name="password" type="password" label={kind === "reset" ? "New password" : "Password"} autoComplete={kind === "login" ? "current-password" : "new-password"} />}
      {kind === "reset" && <Input name="confirm" type="password" label="Confirm password" autoComplete="new-password" />}
      {kind === "login" && (
        <>
          <label className="block text-sm font-medium">
            Sign in as <span className="font-normal text-muted">(demo)</span>
            <select name="role" defaultValue="owner" className="mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px]">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <div className="text-right text-sm"><Link href="/forgot-password" className="text-accent hover:underline">Forgot password?</Link></div>
        </>
      )}
      {state.error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Please wait…" : CFG[kind].cta}</Button>
      {kind === "login" && (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" disabled title="Coming soon — needs Supabase">Magic link · Soon</Button>
          <Button type="button" variant="secondary" disabled title="Coming soon — needs Supabase">Google · Soon</Button>
        </div>
      )}
    </form>
  );
}
