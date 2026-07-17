"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

/**
 * Mobile navigation for the dashboard shell — visible only below `lg`, where the
 * desktop rail ([sidebar.tsx]) is hidden. A sticky top app bar carries the brand
 * and a hamburger; tapping it slides in a drawer containing the shared
 * [SidebarNav]. The drawer traps nothing heavier than it needs to: Escape and a
 * scrim tap close it, focus moves in on open and returns to the trigger on close,
 * and it is `inert` while shut so its links stay out of the tab order.
 */
export function MobileNav({
  isSuperadmin = false,
  impersonating = false,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  // Close on route change (belt-and-suspenders alongside SidebarNav's onNavigate).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; move focus into the drawer on open and back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Top app bar — mobile/tablet only. */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[hsl(var(--sidebar))] px-3 text-white">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link href="/dashboard" aria-label="SpeedSettr" className="inline-flex">
          <Logo white size="sm" />
        </Link>
      </header>

      {/* Drawer — while closed the panel is `invisible`, which pulls it out of the
          tab order and the a11y tree; `visibility` stays in the transition list so
          the slide-out still animates before it hides. */}
      <div className="lg:hidden">
        {/* Scrim */}
        <div
          onClick={close}
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
        {/* Panel */}
        <aside
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-2xl transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-x-0 visible" : "-translate-x-full invisible"
          )}
        >
          <button
            type="button"
            ref={closeRef}
            onClick={close}
            aria-label="Close navigation menu"
            className="absolute right-2 top-2.5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <SidebarNav
            isSuperadmin={isSuperadmin}
            impersonating={impersonating}
            onNavigate={close}
          />
        </aside>
      </div>
    </>
  );
}
