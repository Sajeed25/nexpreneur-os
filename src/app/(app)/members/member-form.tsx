"use client";
import * as React from "react";
import { Button } from "@/components/ui";
import { rupees, todayIST } from "@/lib/booking";
import type { MemberOptions, MemberRow } from "./actions";

export const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export type MemberFormValues = {
  name: string; email: string; phone: string; jobTitle: string; company: string; companyId: string; locationId: string;
  access: "invite" | "password"; password: string; planId: string; startDate: string; couponCode: string;
};

/** Shared by "Add member" and "Edit member". Plan and password fields only appear when adding. */
export function MemberForm({ opts, initial, mode, busy, defaultLocation, onSubmit, onCancel }: {
  opts: MemberOptions; initial?: Partial<MemberRow> & { companyId?: string | null }; mode: "add" | "edit"; busy: boolean; defaultLocation?: string;
  onSubmit: (v: MemberFormValues) => void; onCancel: () => void;
}) {
  const [access, setAccess] = React.useState<"invite" | "password">(opts.emailReady ? "invite" : "password");
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const g = (k: string) => String(f.get(k) ?? "");
      onSubmit({ name: g("name"), email: g("email"), phone: g("phone"), jobTitle: g("jobTitle"), company: g("company"), companyId: g("companyId"), locationId: g("locationId"), access, password: g("password"), planId: g("planId"), startDate: g("startDate"), couponCode: g("couponCode") });
    }} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Full name<input name="name" defaultValue={initial?.name} required minLength={2} maxLength={160} className={field} autoComplete="off" /></label>
      <label className="text-sm font-medium">Email<input name="email" type="email" defaultValue={initial?.email} required maxLength={190} className={field} autoComplete="off" /></label>
      <label className="text-sm font-medium">Phone<input name="phone" type="tel" defaultValue={initial?.phone} maxLength={20} className={field} /></label>
      <label className="text-sm font-medium">Job title<input name="jobTitle" defaultValue={initial?.jobTitle} maxLength={120} className={field} /></label>
      <label className="text-sm font-medium">Company (linked)
        <select name="companyId" defaultValue={initial?.companyId ?? ""} className={field}><option value="">None</option>{opts.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label className="text-sm font-medium">Company name (if not in the list)<input name="company" defaultValue={initial?.company} maxLength={160} className={field} /></label>
      <label className="text-sm font-medium sm:col-span-2">Home location
        <select name="locationId" defaultValue={initial?.locationId ?? defaultLocation ?? ""} className={field}><option value="">Not set</option>{opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </label>

      {mode === "add" && (
        <>
          <fieldset className="rounded-xl border p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">How will they sign in?</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" checked={access === "invite"} onChange={() => setAccess("invite")} disabled={!opts.emailReady} className="mt-1" />
              <span>Email them a link to choose their own password{!opts.emailReady && <span className="text-muted"> (needs email set up first)</span>}</span></label>
            <label className="mt-2 flex items-start gap-2 text-sm"><input type="radio" checked={access === "password"} onChange={() => setAccess("password")} className="mt-1" /><span>Set a temporary password myself</span></label>
            {access === "password" && <label className="mt-3 block text-sm font-medium">Temporary password<input name="password" type="text" minLength={8} maxLength={72} required autoComplete="off" className={field} placeholder="At least 8 characters" /></label>}
          </fieldset>
          {opts.canAssign && (
            <fieldset className="grid gap-4 rounded-xl border p-4 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-sm font-medium">Start a plan now (optional)</legend>
              <label className="text-sm font-medium">Plan<select name="planId" defaultValue="" className={field}><option value="">No plan yet</option>{opts.plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}</select></label>
              <label className="text-sm font-medium">Start date<input name="startDate" type="date" defaultValue={todayIST()} className={field} /></label>
              <label className="text-sm font-medium">Coupon<input name="couponCode" maxLength={40} className={field} style={{ textTransform: "uppercase" }} /></label>
              <p className="text-xs text-muted sm:col-span-3">Choosing a plan issues the first GST invoice and emails it (if email is set up).</p>
            </fieldset>
          )}
        </>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : mode === "add" ? "Add member" : "Save changes"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
