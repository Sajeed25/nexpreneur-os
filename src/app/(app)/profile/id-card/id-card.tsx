"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { usePass } from "../pass-card";

/** A digital ID card (credit-card proportions) with the live door pass. The printout leaves the pass out: a printed copy of a code that changes every minute would never work. */
export function IdCard() {
  const { pass, error } = usePass();
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="no-print flex items-center justify-between">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={16} />Profile</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={16} />Print</Button>
      </div>
      <div className="relative aspect-[85.6/54] overflow-hidden rounded-2xl p-5 text-white shadow-soft" style={{ background: "linear-gradient(135deg, #042341 0%, #0b3a66 60%, #F15A24 160%)" }}>
        {error && !pass ? <p className="text-sm">{error}</p> : !pass ? <p className="text-sm opacity-80">Loading…</p> : (
          <div className="flex h-full justify-between gap-3">
            <div className="flex min-w-0 flex-col justify-between">
              <div><p className="text-xs uppercase tracking-widest opacity-70">{pass.org}</p><p className="mt-3 truncate text-xl font-semibold">{pass.name}</p><p className="truncate text-sm opacity-80">{ROLE_LABEL[pass.role as Role] ?? pass.role}</p></div>
              <p className="truncate text-xs opacity-70">{pass.email}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pass.dataUrl} alt="Live door pass" className="no-print-qr size-28 shrink-0 self-center rounded-lg bg-white p-1.5" />
          </div>
        )}
      </div>
      <p className="no-print text-center text-sm text-muted">The code on the right changes every minute. Add this page to your phone&apos;s Home Screen for quick access at the door.</p>
      <style>{`@media print { .no-print-qr { display: none !important; } }`}</style>
    </div>
  );
}
