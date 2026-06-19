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

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="h-16 flex items-center gap-6 px-6 bg-[hsl(var(--sidebar))] text-white">
      <Link href="/admin" aria-label="SpeedSettr Admin" className="flex items-center gap-2">
        <Logo dark />
        <Badge variant="secondary" className="uppercase tracking-wide">
          Admin
        </Badge>
      </Link>

      <nav className="flex items-center gap-1">
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
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="ml-auto flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-white/70 transition-colors hover:text-white min-h-[40px]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to app
      </Link>
    </header>
  );
}
