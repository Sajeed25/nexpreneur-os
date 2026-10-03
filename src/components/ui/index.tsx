import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn, initials } from "@/lib/utils";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};
export function Button({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-[15px]",
        variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
        variant === "secondary" && "border bg-surface hover:bg-surface-2",
        variant === "ghost" && "hover:bg-surface-2",
        className,
      )}
    />
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("rounded-2xl border bg-surface p-5 shadow-soft", className)} />;
}

const TONES = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  grey: "bg-surface-2 text-muted",
};
export function Badge({ tone = "grey", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}
export const statusTone = (s: string): keyof typeof TONES =>
  ({ Active: "green", Paid: "green", Available: "green", Trial: "blue", Expiring: "amber", Due: "amber", Reserved: "amber", Booked: "blue", Paused: "grey", Overdue: "red", Maintenance: "red" } as Record<string, keyof typeof TONES>)[s] ?? "grey";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size }} className="inline-grid shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
      {initials(name)}
    </span>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  function Input({ label, className, id, ...p }, ref) {
    const _id = id ?? p.name;
    return (
      <label htmlFor={_id} className="block text-sm font-medium">
        {label}
        <input ref={ref} id={_id} {...p} className={cn("mt-1.5 h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20", className)} />
      </label>
    );
  },
);

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function ComingSoon({ title, phase }: { title: string; phase?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Sparkles size={22} /></span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">Coming soon{phase ? ` — planned for ${phase}` : ""}. The data model for this module already exists in the schema.</p>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}
