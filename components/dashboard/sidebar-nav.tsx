"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  MessageCircle,
  BarChart3,
  BookOpen,
  Settings,
  CreditCard,
  LogOut,
  ShieldCheck,
  Sparkles,
  LifeBuoy,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CONTACTS, SUPPORT_HOURS } from "@/lib/support-contacts";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/chatbots", label: "Chatbots", icon: Bot },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/requests", label: "Request Changes", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

// While an admin is "viewing as" a client, scope the sidebar to Overview →
// Request Changes (hide Feedback, Settings, Billing) per the impersonation spec.
const IMPERSONATION_HREFS = new Set([
  "/dashboard",
  "/chatbots",
  "/conversations",
  "/statistics",
  "/knowledge-base",
  "/requests",
]);

/**
 * The sidebar's inner content — brand header, nav list, sign-out — with no
 * width/background of its own (the surrounding container supplies those). Shared
 * by the desktop rail ([sidebar.tsx]) and the mobile drawer ([mobile-nav.tsx])
 * so both render identical navigation. `onNavigate` lets the drawer close itself
 * the instant a link is tapped.
 */
export function SidebarNav({
  isSuperadmin = false,
  impersonating = false,
  onNavigate,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const base = impersonating
    ? nav.filter((item) => IMPERSONATION_HREFS.has(item.href))
    : nav;
  const items =
    isSuperadmin && !impersonating
      ? [...base, { href: "/admin", label: "Admin", icon: ShieldCheck }]
      : base;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="h-16 shrink-0 flex items-center px-6 border-b border-white/10">
        <Link href="/dashboard" aria-label="SpeedSettr" onClick={onNavigate}>
          <Logo white />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-[hsl(var(--sidebar-active))] text-white shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 p-3 border-t border-white/10 space-y-1">
        <HelpContact onNavigate={onNavigate} />
        {!impersonating && (
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Sidebar "Help" control — a toggle that reveals the SpeedSettr support contacts
 * ([lib/support-contacts.ts]) as tap-to-call links. Lives in the footer of both the
 * desktop rail and the mobile drawer. `onNavigate` closes the mobile drawer when a
 * number is tapped.
 */
function HelpContact({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {open && (
        <div className="mb-1 rounded-md bg-white/5 p-2 space-y-1">
          <p className="px-1 pb-1 text-xs text-white/50">Call or text the team</p>
          {SUPPORT_CONTACTS.map((c) => (
            <a
              key={c.tel}
              href={`tel:${c.tel}`}
              onClick={onNavigate}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="font-medium">@{c.name}</span>
              <span className="tabular-nums text-white/60">{c.phone}</span>
            </a>
          ))}
          <p className="px-1 pt-1 text-xs text-white/50">Available {SUPPORT_HOURS}</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <LifeBuoy className="h-4 w-4" />
        Help
      </button>
    </div>
  );
}
