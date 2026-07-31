"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav, BoltMark, type NavCounts } from "@/components/dashboard/sidebar-nav";
import { MobileTabBar } from "@/components/dashboard/mobile-tabbar";
import { AiLiveToggle } from "@/components/dashboard/ai-live-toggle";
import { BotSwitcher } from "@/components/dashboard/bot-switcher";
import type { WorkspaceBot } from "@/lib/workspace";

/**
 * The mobile shell - a slim brand header at the top, the bottom tab bar at
 * thumb height, and a "More" drawer holding the full navigation.
 *
 * The header stays light rather than navy so the phone screens read as one
 * continuous #f6f7fc surface the way the design draws them; the navy is saved
 * for the drawer and the hero cards, where it means something.
 */
export function MobileNav({
  isSuperadmin = false,
  impersonating = false,
  bots,
  aiLive,
  counts,
  planName,
  planNote,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
  bots: WorkspaceBot[];
  aiLive: boolean;
  counts?: NavCounts;
  planName?: string;
  planNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Top strip - brand, chatbot scope, and the AI master switch. Even on a
          phone the design refuses to hide whether replies are going out. */}
      <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-ss-line bg-ss-page px-4 py-2.5 lg:hidden">
        <Link
          href="/dashboard"
          aria-label="SpeedSettr"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-ss-indigo text-white"
        >
          <BoltMark size={18} />
        </Link>
        <BotSwitcher bots={bots} className="min-w-0 flex-1" />
        <AiLiveToggle
          live={aiLive}
          botIds={bots.map((b) => b.id)}
          className="shrink-0"
        />
      </header>

      {/* More drawer. `invisible` while shut keeps its links out of the tab
          order; visibility stays in the transition so the slide still animates. */}
      <div className="lg:hidden">
        <div
          onClick={close}
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-40 bg-ss-navy/40 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
        <aside
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-ss-navy text-white shadow-2xl transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none",
            open ? "visible translate-x-0" : "invisible -translate-x-full"
          )}
        >
          <button
            type="button"
            ref={closeRef}
            onClick={close}
            aria-label="Close navigation menu"
            className="absolute right-2 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-ctl-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <SidebarNav
            isSuperadmin={isSuperadmin}
            impersonating={impersonating}
            counts={counts}
            planName={planName}
            planNote={planNote}
            onNavigate={close}
          />
        </aside>
      </div>

      <MobileTabBar
        counts={counts}
        moreOpen={open}
        onMore={() => setOpen((v) => !v)}
      />
    </>
  );
}
