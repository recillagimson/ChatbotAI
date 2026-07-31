"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, isNavActive, type NavItem } from "@/lib/nav";
import type { NavCounts } from "@/components/dashboard/sidebar-nav";

/**
 * Bottom tab bar - the mobile shell's primary navigation.
 *
 * The design's reasoning: phone use of this product is "someone's waiting, reply
 * now", so the Inbox and the follow-up queue are one tap away at thumb height,
 * and everything else lives behind More. It sits above the home indicator via
 * `env(safe-area-inset-bottom)` so the last row of a list is never covered.
 */
export function MobileTabBar({
  counts,
  onMore,
  moreOpen = false,
}: {
  counts?: NavCounts;
  onMore: () => void;
  moreOpen?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ss-line bg-white/95 px-2.5 pt-2 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {MOBILE_TABS.map((tab) => (
        <Tab
          key={tab.href}
          item={tab}
          active={!moreOpen && isNavActive(tab.href, pathname)}
          count={tab.badge && counts ? counts[tab.badge] : undefined}
        />
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreOpen}
        aria-label="More sections"
        className={cn(
          "flex flex-1 flex-col items-center gap-1 rounded-ctl py-1 transition-colors",
          moreOpen ? "text-ss-indigo-600" : "text-ss-muted"
        )}
      >
        <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
        <span
          className={cn(
            "text-[9.5px] leading-none",
            moreOpen ? "font-bold" : "font-semibold"
          )}
        >
          More
        </span>
      </button>
    </nav>
  );
}

function Tab({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-1 rounded-ctl py-1 transition-colors",
        active ? "text-ss-indigo-600" : "text-ss-muted"
      )}
    >
      <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
      <span
        className={cn(
          "text-[9.5px] leading-none",
          active ? "font-bold" : "font-semibold"
        )}
      >
        {item.short ?? item.label}
      </span>
      {count ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -top-0.5 left-1/2 ml-2 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 font-display text-[9px] font-bold leading-none text-white",
            item.badgeTone === "amber" ? "bg-ss-amber" : "bg-ss-rose"
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
