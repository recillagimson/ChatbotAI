"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  BarChart3,
  BookOpen,
  Settings,
  CreditCard,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/chatbots", label: "Chatbots", icon: Bot },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 flex flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Link href="/dashboard" aria-label="SpeedSettr">
          <Logo dark />
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
      <div className="p-3 border-t border-white/10">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
