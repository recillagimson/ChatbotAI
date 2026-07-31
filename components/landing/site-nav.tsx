"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandLockup } from "@/components/landing/brand-lockup";
import { cn } from "@/lib/utils";

/**
 * Marketing nav. It sits *on* the dark canvas rather than in a white bar above
 * it, so the page opens as one uninterrupted surface.
 *
 * Past 40px of scroll it compacts and frosts, the way the design's script
 * drives it. The design left the bar `position:relative`, which meant that
 * state could never actually be seen - the bar had scrolled away by the time it
 * applied. Sticky is what makes the animation mean anything, so the bar sticks.
 *
 * The section links are same-page anchors, so they're plain <a>: Next's <Link>
 * adds client routing this doesn't need, and a hash-only href would still push a
 * history entry through the router.
 */

const SECTIONS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b transition-[background-color,box-shadow,border-color] duration-[350ms]",
        stuck
          ? "border-white/[0.07] bg-[#15123a]/[0.82] shadow-[0_14px_30px_-22px_rgba(0,0,0,.9)] backdrop-blur-[14px]"
          : "border-white/[0.07] bg-transparent"
      )}
    >
      <div
        className={cn(
          "container flex items-center gap-8 transition-[height] duration-[350ms] ease-[cubic-bezier(.22,.7,.2,1)]",
          stuck ? "h-[58px]" : "h-[74px]"
        )}
      >
        <Link href="/" aria-label="SpeedSettr home" className="shrink-0">
          <BrandLockup />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 lg:flex">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-[13.5px] font-medium text-[#b6b4dd] transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Below `sm` the header is just the lockup and the toggle - the logo,
            two buttons and a hamburger don't fit on a 390px phone without the
            CTA wrapping onto two lines. Both actions live in the panel there. */}
        <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/login"
            className="hidden whitespace-nowrap rounded-ctl-lg border border-white/[0.16] px-[15px] py-2.5 text-[13px] font-semibold text-white transition-colors hover:border-white/[0.32] hover:bg-white/10 sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="hidden whitespace-nowrap rounded-ctl-lg bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-[18px] py-[11px] text-[13px] font-bold text-white shadow-[0_12px_26px_-14px_rgba(124,34,196,.95)] transition-[transform,box-shadow,filter] duration-[340ms] ease-[cubic-bezier(.22,.7,.2,1)] hover:shadow-[0_18px_34px_-12px_rgba(124,34,196,1)] hover:brightness-110 motion-safe:hover:-translate-y-0.5 sm:block"
          >
            Get started
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-nav-menu"
            className="-mr-1.5 rounded-ctl p-1.5 text-white lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            {open ? (
              <X className="h-6 w-6" aria-hidden />
            ) : (
              <Menu className="h-6 w-6" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Mobile disclosure. Hidden rather than unmounted so the links stay in the
          DOM for assistive tech that reads the whole page. */}
      <div
        id="site-nav-menu"
        className={cn(
          "border-t border-white/[0.07] lg:hidden",
          open ? "block" : "hidden"
        )}
      >
        <nav aria-label="Sections" className="container flex flex-col py-2">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="py-3 text-[15px] font-medium text-[#b6b4dd] transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2.5 border-t border-white/[0.07] pt-4 pb-2 sm:hidden">
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="rounded-ctl-lg bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-[18px] py-3 text-center text-[14px] font-bold text-white shadow-[0_12px_26px_-14px_rgba(124,34,196,.95)] transition-[filter] hover:brightness-110"
            >
              Get started
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-ctl-lg border border-white/[0.16] px-[18px] py-3 text-center text-[14px] font-semibold text-white transition-colors hover:border-white/[0.32] hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
