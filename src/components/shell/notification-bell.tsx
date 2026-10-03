"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { unreadCount } from "@/app/(app)/notifications/actions";

/** Unread badge. Near-real-time by polling once a minute (and on navigation / when notifications are read). */
export function NotificationBell() {
  const [n, setN] = React.useState(0);
  const pathname = usePathname();
  const refresh = React.useCallback(() => { unreadCount().then(setN).catch(() => {}); }, []);

  React.useEffect(() => {
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    window.addEventListener("nx:notifications", refresh);
    return () => { clearInterval(t); window.removeEventListener("nx:notifications", refresh); };
  }, [refresh, pathname]);

  return (
    <Link href="/notifications" aria-label={n ? `Notifications, ${n} unread` : "Notifications"} className="relative grid size-10 place-items-center rounded-xl hover:bg-surface-2">
      <Bell size={19} />
      {n > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-fg">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
