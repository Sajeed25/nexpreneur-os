"use client";
import * as React from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { ROLES, ROLE_LABEL } from "@/lib/rbac";
import { consumeMagic, forgotPassword, register, requestMagic, resetPassword, signIn, type FormState } from "./actions";

type Kind = "login" | "register" | "forgot" | "reset" | "magic" | "magicUse";
const CFG = {
  login: { action: signIn, cta: "Sign in" },
  register: { action: register, cta: "Create account" },
  forgot: { action: forgotPassword, cta: "Send reset link" },
  reset: { action: resetPassword, cta: "Update password" },
  magic: { action: requestMagic, cta: "Email me a link" },
  magicUse: { action: consumeMagic, cta: "Sign in" },
} as const;

const btn = "inline-flex h-11 items-center justify-center rounded-xl border bg-surface px-4 text-[15px] font-medium";

export function AuthForm({ kind, demo = false, token, magic = false, google = false }: { kind: Kind; demo?: boolean; token?: string; magic?: boolean; google?: boolean }) {
  const [state, act, pending] = React.useActionState<FormState, FormData>(CFG[kind].action, {});
  return (
    <form action={act} className="space-y-4" noValidate>
      {(kind === "reset" || kind === "magicUse") && <input type="hidden" name="token" value={token ?? ""} />}
      {kind === "register" && <Input name="name" label="Full name" autoComplete="name" />}
      {kind !== "reset" && kind !== "magicUse" && <Input name="email" type="email" label="Email" autoComplete="email" placeholder="you@company.in" />}
      {kind !== "forgot" && kind !== "magic" && kind !== "magicUse" && <Input name="password" type="password" label={kind === "reset" ? "New password" : "Password"} autoComplete={kind === "login" ? "current-password" : "new-password"} />}
      {kind === "reset" && <Input name="confirm" type="password" label="Confirm password" autoComplete="new-password" />}
      {kind === "login" && (
        <>
          {demo && (
            <label className="block text-sm font-medium">
              Sign in as <span className="font-normal text-muted">(demo mode: database not connected)</span>
              <select name="role" defaultValue="owner" className="mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px]">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          )}
          <div className="text-right text-sm"><Link href="/forgot-password" className="text-accent hover:underline">Forgot password?</Link></div>
        </>
      )}
      {state.error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{state.ok}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Please wait…" : CFG[kind].cta}</Button>
      {kind === "login" && (
        <div className="grid grid-cols-2 gap-3">
          {magic ? <Link href="/magic-link" className={btn}>Email me a link</Link> : <Button type="button" variant="secondary" disabled title="Needs email (SMTP) to be set up">Email link</Button>}
          {/* A plain link, not a fetch: the browser must follow the redirect to Google. */}
          {google ? <a href="/api/auth/google" className={btn}>Google</a> : <Button type="button" variant="secondary" disabled title="Needs Google keys to be set up">Google</Button>}
        </div>
      )}
    </form>
  );
}
