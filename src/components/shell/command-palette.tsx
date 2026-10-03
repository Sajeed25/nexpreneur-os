"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { globalSearch, type Hit } from "@/app/(app)/search/actions";
import type { NAV } from "./nav";

export function CommandPalette({ open, onClose, items, go }: {
  open: boolean; onClose: () => void; items: typeof NAV; go: (href: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState<Hit[]>([]);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (open) { setQ(""); setFound([]); setTimeout(() => ref.current?.focus(), 0); } }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Search the database a moment after typing stops. Results from an older query are ignored.
  React.useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => { globalSearch(term).then((r) => live && setFound(r)).catch(() => live && setFound([])); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);

  const hits = React.useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    const pages = items.map((n) => ({ label: n.label, sub: "Go to page", href: n.href }));
    if (!s) return pages.slice(0, 8);
    return [...pages.filter((p) => p.label.toLowerCase().includes(s)), ...found];
  }, [q, items, found]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/40 p-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal aria-label="Search">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-4">
          <Search size={18} className="text-muted" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hits[0] && go(hits[0].href)}
            placeholder="Search pages, members, invoices, resources…" className="h-14 flex-1 bg-transparent outline-none" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {hits.length === 0 && <li className="p-4 text-sm text-muted">No results.</li>}
          {hits.map((h, i) => (
            <li key={`${h.href}-${h.label}-${i}`}>
              <button onClick={() => go(h.href)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                <span className="truncate font-medium">{h.label}</span><span className="shrink-0 text-xs text-muted">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
