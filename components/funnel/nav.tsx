"use client";

import * as React from "react";
import { AuButton } from "@/components/aurum/primitives";
import { cn } from "@/lib/utils";

const LINKS = [
  // Named for what is actually there, not for safe umbrella words. A visitor
  // scanning the bar should be able to predict the section from the label.
  { href: "#the-gap", label: "The gap" },
  { href: "#your-numbers", label: "Your numbers" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#the-call", label: "The call" },
];

/**
 * The page's only persistent chrome: a translucent bar the content scrolls
 * UNDER, so the page reads as one continuous surface with a pane of glass
 * over it rather than as a fixed strip stacked on a document.
 *
 * At the very top it is fully transparent and borderless - the hero should
 * open on nothing. The glass materialises on first scroll.
 */
export function FunnelNav() {
  const [lifted, setLifted] = React.useState(false);

  React.useEffect(() => {
    // Passive listener + a cheap comparison; this runs on every scroll frame,
    // so it must never touch layout.
    const onScroll = () => setLifted(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-300 ease-au-out",
        lifted ? "au-glass" : "border-b border-transparent bg-transparent"
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-6 px-5 sm:px-8"
      >
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded-au-chip font-au text-[17px] font-bold tracking-[-0.02em] text-au-ink"
        >
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="au-pulse absolute inset-0 text-au-gold" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-au-gold" />
          </span>
          SpeedSettr
        </a>

        <ul className="ml-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="au-press rounded-au-chip px-3 py-2 text-[14.5px] font-medium text-au-ink-2 hover:bg-[rgba(26,25,22,0.05)] hover:text-au-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* The CTA never leaves the screen. On a funnel whose single goal is a
            booked call, the booking action is the one control that must be
            reachable from any scroll position without a decision. */}
        <div className="ml-auto lg:ml-0">
          <AuButton asChild size="sm" className="px-4">
            <a href="#book">Book a call</a>
          </AuButton>
        </div>
      </nav>
    </header>
  );
}

/**
 * The mobile counterpart: a bottom bar that materialises once the hero's own
 * CTA has scrolled away, and hides again at the booking form so it never
 * covers the field the visitor is typing in.
 */
export function StickyBookBar() {
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const book = document.getElementById("book");
    if (!hero || !book) return;

    // Two observers rather than a scroll-position guess: the bar's visibility
    // is defined by what is on screen, so it stays correct at any viewport
    // height or after the content above it changes.
    let heroVisible = true;
    let bookVisible = false;
    const sync = () => setShown(!heroVisible && !bookVisible);

    const heroIo = new IntersectionObserver(
      ([e]) => {
        heroVisible = e.isIntersecting;
        sync();
      },
      { threshold: 0 }
    );
    const bookIo = new IntersectionObserver(
      ([e]) => {
        bookVisible = e.isIntersecting;
        sync();
      },
      { threshold: 0.08 }
    );
    heroIo.observe(hero);
    bookIo.observe(book);
    return () => {
      heroIo.disconnect();
      bookIo.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "au-glass fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 ease-au-spring lg:hidden",
        shown ? "translate-y-0" : "translate-y-[130%]"
      )}
      // Hidden from AT while off-screen: an announced button nobody can reach
      // is worse than no button.
      aria-hidden={!shown}
    >
      <AuButton asChild size="lg" block tabIndex={shown ? undefined : -1}>
        <a href="#book">Book my 20-minute call</a>
      </AuButton>
    </div>
  );
}
