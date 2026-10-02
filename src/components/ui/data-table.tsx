"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

export type Column<T> = { key: string; header: string; render: (row: T) => React.ReactNode };

export function DataTable<T extends { id: string }>({
  rows, columns, searchText, pageSize = 10, filters,
}: {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  pageSize?: number;
  filters?: React.ReactNode;
}) {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(
    () => rows.filter((r) => searchText(r).toLowerCase().includes(q.toLowerCase())),
    [rows, q, searchText],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="rounded-2xl border bg-surface shadow-soft">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search…"
            aria-label="Search table"
            className="h-10 w-full rounded-xl border bg-bg pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        {filters}
      </div>
      {slice.length === 0 ? (
        <div className="p-6"><EmptyState title="No results" hint="Try a different search or filter." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>{columns.map((c) => <th key={c.key} className="px-4 py-3 font-medium">{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id} className="border-t hover:bg-surface-2/60">
                  {columns.map((c) => <td key={c.key} className="px-4 py-3">{c.render(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t p-3 text-sm text-muted">
        <span>{filtered.length} results</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft size={16} /></Button>
          <span>{cur + 1} / {pages}</span>
          <Button variant="secondary" size="sm" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight size={16} /></Button>
        </div>
      </div>
    </div>
  );
}
