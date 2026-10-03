"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, ChevronDown, HelpCircle, LogOut, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { NAV } from "./nav";
import { Avatar } from "@/components/ui";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { LogoMark, Wordmark } from "@/components/brand";
import { ACCESS, ROLE_LABEL, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(auth)/actions";

export type LocOption = { id: string; name: string };
const LocationCtx = React.createContext<{ loc: string; setLoc: (l: string) => void; locations: LocOption[] }>({ loc: "all", setLoc: () => {}, locations: [] });
export const useLocation = () => React.useContext(LocationCtx);

export function AppShell({ user, locations: places, children }: { user: { name: string; role: Role }; locations: LocOption[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const isOwner = user.role === "owner" || user.role === "super_admin";
  // Owners can look at every location together; everyone else works in one location at a time.
  const options = React.useMemo<LocOption[]>(() => (isOwner || places.length === 0 ? [{ id: "all", name: "All Locations" }, ...places] : places), [isOwner, places]);
  const [loc, setLoc] = React.useState(options[0]?.id ?? "all");
  const [cmd, setCmd] = React.useState(false);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    try {
      const t = localStorage.getItem("nx_theme");
      if (t === "dark") { setDark(true); document.documentElement.classList.add("dark"); }
      const l = localStorage.getItem("nx_loc");
      if (l && options.some((o) => o.id === l)) setLoc(l);
    } catch {}
  }, [options]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("nx_theme", next ? "dark" : "light"); } catch {}
  };
  const changeLoc = (l: string) => { setLoc(l); try { localStorage.setItem("nx_loc", l); } catch {} };

  const items = NAV.filter((n) => ACCESS[user.role].includes(n.section));
  const mobileItems = (user.role === "member" ? ["dashboard", "bookings", "memberships", "payments", "profile"].map((s) => items.find((n) => n.section === s)!).filter(Boolean) : items.filter((n) => n.section !== "profile")).slice(0, 5);

  return (
    <LocationCtx.Provider value={{ loc: options.some((o) => o.id === loc) ? loc : (options[0]?.id ?? "all"), setLoc: changeLoc, locations: options }}>
      <div className="min-h-dvh">
        <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-surface transition-[width] md:flex", collapsed ? "w-[72px]" : "w-64")}>
          <div className="flex h-16 items-center gap-2 px-4">
            <LogoMark size={36} />
            {!collapsed && <span className="flex flex-col"><Wordmark className="text-[21px]" /><span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">OS</span></span>}
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
            {items.map(({ section, label, icon: Icon, href }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={section} href={href} title={label} aria-current={active ? "page" : undefined}
                  className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] transition", active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                  <Icon size={19} className="shrink-0" />
                  {!collapsed && (user.role === "member" && section === "dashboard" ? "Home" : label)}
                </Link>
              );
            })}
          </nav>
          <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" className="m-3 flex h-10 items-center gap-3 rounded-xl px-3 text-muted hover:bg-surface-2">
            <PanelLeft size={19} />{!collapsed && "Collapse"}
          </button>
        </aside>

        <div className={cn("transition-[padding]", collapsed ? "md:pl-[72px]" : "md:pl-64")}>
          <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-bg/85 px-4 backdrop-blur sm:gap-3 sm:px-6">
            <div className="relative">
              <select value={options.some((o) => o.id === loc) ? loc : (options[0]?.id ?? "all")} onChange={(e) => changeLoc(e.target.value)} aria-label="Location"
                className="h-10 appearance-none rounded-xl border bg-surface pl-3 pr-8 text-sm font-medium outline-none">
                {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-3.5 text-muted" />
            </div>
            <button onClick={() => setCmd(true)} className="ml-1 flex h-10 flex-1 items-center gap-2 rounded-xl border bg-surface px-3 text-sm text-muted sm:max-w-md">
              <Search size={16} /><span className="truncate">Search…</span>
              <kbd className="ml-auto hidden rounded border px-1.5 text-xs sm:block">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <button aria-label="Help" onClick={() => setCmd(true)} className="hidden size-10 place-items-center rounded-xl hover:bg-surface-2 sm:grid"><HelpCircle size={19} /></button>
              <button aria-label="Toggle theme" onClick={toggleTheme} className="grid size-10 place-items-center rounded-xl hover:bg-surface-2">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
              <div className="relative">
                <button onClick={() => setMenu(!menu)} aria-label="Account menu" className="ml-1"><Avatar name={user.name} /></button>
                {menu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border bg-surface p-2 shadow-soft">
                    <div className="px-3 py-2"><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p></div>
                    <Link href="/profile" onClick={() => setMenu(false)} className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-surface-2">Profile</Link>
                    <form action={signOut}>
                      <button className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-surface-2"><LogOut size={16} />Sign out</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10">{children}</main>
        </div>

        <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {mobileItems.map(({ section, label, icon: Icon, href }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={section} href={href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-accent" : "text-muted")}>
                <Icon size={21} />{label}
              </Link>
            );
          })}
        </nav>
        {ACCESS[user.role].includes("ai") && !pathname.startsWith("/ai") && (
          <Link href="/ai" aria-label="Open AI assistant" className="fixed bottom-20 right-4 z-30 grid size-12 place-items-center rounded-full bg-primary text-primary-fg shadow-soft transition hover:scale-105 md:bottom-6 md:right-6"><Bot size={22} /></Link>
        )}
        <CommandPalette open={cmd} onClose={() => setCmd(false)} items={items} go={(h) => { setCmd(false); router.push(h); }} />
      </div>
    </LocationCtx.Provider>
  );
}
