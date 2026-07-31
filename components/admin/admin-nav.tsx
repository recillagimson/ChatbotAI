"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, GitPullRequestArrow, MessageSquare, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";

const nav = [
  { href: "/admin", label: "Clients", icon: Users },
  { href: "/admin/requests", label: "Change Requests", icon: GitPullRequestArrow },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
];

/** The three admin destinations - rendered inline on desktop and in a
 *  horizontally scrollable row on mobile so nothing crowds or clips. */
function NavItems({ pathname }: { pathname: string }) {
  return (
    <>
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] whitespace-nowrap",
              active ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="bg-[hsl(var(--sidebar))] text-white">
      {/* Brand row: logo + (desktop) inline nav + Back to app. */}
      <div className="flex h-14 items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/admin"
          aria-label="SpeedSettr Admin"
          className="flex items-center gap-2 shrink-0"
        >
          <Logo dark size="sm" />
          <Badge variant="secondary" className="uppercase tracking-wide">
            Admin
          </Badge>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavItems pathname={pathname} />
        </nav>

        <Link
          href="/dashboard"
          className="ml-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white min-h-[40px] whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Back to app</span>
        </Link>
      </div>

      {/* Mobile nav row: horizontally scrollable so the labels never wrap or clip. */}
      <nav className="flex items-center gap-1 overflow-x-auto px-2 pb-2 md:hidden">
        <NavItems pathname={pathname} />
      </nav>
    </header>
  );
}
