"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { MEMBERS, RESOURCES } from "@/lib/demo-data";
import type { NAV } from "./nav";

type Hit = { label: string; sub: string; href: string };

export function CommandPalette({ open, onClose, items, go }: {
  open: boolean; onClose: () => void; items: typeof NAV; go: (href: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (open) { setQ(""); setTimeout(() => ref.current?.focus(), 0); } }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const hits = React.useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    const pages = items.map((n) => ({ label: n.label, sub: "Go to page", href: n.href }));
    if (!s) return pages.slice(0, 8);
    const canMembers = items.some((n) => n.section === "members");
    const canRes = items.some((n) => n.section === "resources");
    return [
      ...pages.filter((p) => p.label.toLowerCase().includes(s)),
      ...(canMembers ? MEMBERS.filter((m) => (m.name + m.company).toLowerCase().includes(s)).slice(0, 5).map((m) => ({ label: m.name, sub: `Member · ${m.company}`, href: "/members" })) : []),
      ...(canRes ? RESOURCES.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 5).map((r) => ({ label: r.name, sub: `Resource · ${r.type}`, href: "/resources" })) : []),
    ];
  }, [q, items]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/40 p-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal aria-label="Search">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-4">
          <Search size={18} className="text-muted" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hits[0] && go(hits[0].href)}
            placeholder="Search pages, members, resources…" className="h-14 flex-1 bg-transparent outline-none" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {hits.length === 0 && <li className="p-4 text-sm text-muted">No results.</li>}
          {hits.map((h, i) => (
            <li key={i}>
              <button onClick={() => go(h.href)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                <span className="font-medium">{h.label}</span><span className="text-xs text-muted">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
