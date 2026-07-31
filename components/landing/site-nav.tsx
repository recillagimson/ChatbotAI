"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Marketing nav. It sits *on* the dark hero rather than in a white bar above it,
 * so the page opens on one uninterrupted dark canvas - the header, the hero and
 * the proof strip read as a single surface.
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

  return (
    <header className="relative z-30 border-b border-white/[0.07]">
      <div className="container flex h-[74px] items-center gap-8">
        <Link href="/" aria-label="SpeedSettr home" className="shrink-0">
          <Logo white />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-[13.5px] font-medium text-[#c3c0e4] transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden px-3.5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:text-[#c3c0e4] sm:block"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-ctl-lg bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-[18px] py-[11px] text-[13.5px] font-bold text-white shadow-[0_12px_26px_-14px_rgba(124,34,196,.95)] transition-transform hover:scale-[1.03]"
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
              className="py-3 text-[15px] font-medium text-[#c3c0e4] transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
          <Link
            href="/login"
            className="border-t border-white/[0.07] py-3 text-[15px] font-semibold text-white sm:hidden"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
