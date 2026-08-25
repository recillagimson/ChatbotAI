"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  GitPullRequestArrow,
  MessageSquare,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BoltMark } from "@/components/dashboard/sidebar-nav";

/** Live counts for the rail badges (pending change requests, new feedback). */
export interface AdminNavCounts {
  requests?: number;
  feedback?: number;
}

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which count (if any) hangs off this item. */
  badge?: keyof AdminNavCounts;
  /** True when the current path belongs to this destination. */
  isActive: (pathname: string) => boolean;
}

// The three admin destinations. Clients also owns the per-client detail route, so
// its matcher covers /admin/clients/* as well as the /admin root.
const ADMIN_ITEMS: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Clients",
    icon: Users,
    isActive: (p) => p === "/admin" || p.startsWith("/admin/clients"),
  },
  {
    href: "/admin/requests",
    label: "Change Requests",
    icon: GitPullRequestArrow,
    badge: "requests",
    isActive: (p) => p.startsWith("/admin/requests"),
  },
  {
    href: "/admin/feedback",
    label: "Feedback",
    icon: MessageSquare,
    badge: "feedback",
    isActive: (p) => p.startsWith("/admin/feedback"),
  },
];

function useSignOut() {
  const router = useRouter();
  return async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };
}

/** The bolt mark + wordmark + ADMIN tag, matching the client rail's lockup. */
function AdminBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/admin"
      aria-label="SpeedSettr Admin"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-ctl-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-ctl-lg bg-ss-indigo text-white">
        <BoltMark size={20} />
      </span>
      <span>
        <span className="block font-display text-[15.5px] font-extrabold italic leading-none tracking-[-0.01em] text-white">
          SPEEDSETTR
        </span>
        <span className="mt-[3px] block text-[8px] font-bold leading-none tracking-[0.22em] text-ss-indigo-300">
          ADMIN CONSOLE
        </span>
      </span>
    </Link>
  );
}

function RailBadge({
  count,
  active,
}: {
  count: number | undefined;
  active: boolean;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-[7px] py-[3px] font-display text-[10px] font-bold leading-none",
        active ? "bg-white/20 text-white" : "bg-ss-rose text-white"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Desktop admin rail - the 252px navy column matching the client dashboard's
 * Sidebar, but scoped to the three admin destinations plus a way back to the app.
 * Hidden below `lg`, where AdminMobileHeader takes over.
 */
export function AdminSidebar({ counts }: { counts?: AdminNavCounts }) {
  const pathname = usePathname();
  const signOut = useSignOut();

  return (
    <aside className="hidden h-full w-[252px] shrink-0 flex-col bg-ss-navy text-white lg:flex">
      <div className="flex shrink-0 items-center gap-2.5 px-5 pb-[22px] pt-[22px]">
        <AdminBrand />
      </div>

      <nav className="ss-scroll flex-1 overflow-y-auto px-4 pb-2">
        <div className="px-3 pb-2.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.16em] text-ss-nav-label">
          Admin
        </div>
        <div className="flex flex-col gap-[3px]">
          {ADMIN_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-sm leading-none transition-colors",
                  active
                    ? "bg-ss-indigo font-semibold text-white shadow-ss-nav"
                    : "font-medium text-ss-nav-text hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                <RailBadge count={item.badge ? counts?.[item.badge] : undefined} active={active} />
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 px-4 pb-[18px]">
        <Link
          href="/dashboard"
          className="flex w-full items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-[13.5px] font-medium leading-none text-ss-nav-text transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
          Back to app
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="mt-0.5 flex w-full items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-[13.5px] font-medium leading-none text-ss-nav-dim transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

/**
 * Mobile admin header - a compact navy bar shown below `lg`, with the brand, a
 * horizontally scrollable row of the three destinations, and a back-to-app link.
 */
export function AdminMobileHeader({ counts }: { counts?: AdminNavCounts }) {
  const pathname = usePathname();

  return (
    <header className="shrink-0 bg-ss-navy text-white lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <AdminBrand />
        <Link
          href="/dashboard"
          className="ml-auto flex items-center gap-1.5 rounded-ctl px-2.5 py-2 text-[12.5px] font-medium leading-none text-ss-nav-text transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Back to app</span>
        </Link>
      </div>
      <nav className="ss-rail flex items-center gap-1 overflow-x-auto px-3 pb-2.5">
        {ADMIN_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-ctl px-3 py-2 text-[13px] leading-none transition-colors",
                active
                  ? "bg-ss-indigo font-semibold text-white"
                  : "font-medium text-ss-nav-text hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
              {item.badge && counts?.[item.badge] ? (
                <span className="rounded-full bg-ss-rose px-[6px] py-[2px] font-display text-[9.5px] font-bold leading-none text-white">
                  {counts[item.badge]! > 99 ? "99+" : counts[item.badge]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
