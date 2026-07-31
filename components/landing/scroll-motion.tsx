"use client";

import { useEffect } from "react";

/**
 * The homepage's scroll motion, ported from the design's support script: each
 * block fades and rises 28px as it enters the viewport, siblings staggered
 * 95ms apart, the proof figures tick up to their value, and the two hero orbs
 * drift at different rates against the scroll.
 *
 * Nothing here can cost a reader content. The rule that hides an unrevealed
 * block is keyed on `data-motion`, an attribute set only from inside this
 * effect - so if the JS never loads, or throws, or the visitor asked for
 * reduced motion, every block renders plainly. The 9s failsafe (the design has
 * one too) covers the case where an observer somehow never fires.
 */

/** Matches the design: anything above this fraction of the viewport at load is
 *  already on screen, so it must not blink out and animate back in. */
const REVEAL_AT = 0.94;
const STAGGER_MS = 95;
const COUNT_MS = 1200;

export function ScrollMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.setAttribute("data-motion", "");

    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]")
    );

    // Stagger is per group of siblings, so three cards in a row cascade but the
    // next section starts from zero again.
    const seen = new Map<Element, number>();
    for (const el of els) {
      const parent = el.parentElement;
      if (!parent) continue;
      const i = seen.get(parent) ?? 0;
      seen.set(parent, i + 1);
      el.style.setProperty("--reveal-delay", `${i * STAGGER_MS}ms`);
    }

    const reveal = (el: HTMLElement) => {
      if (el.hasAttribute("data-revealed")) return;
      el.setAttribute("data-revealed", "");
      el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
    };

    const fold = window.innerHeight * REVEAL_AT;
    const staged: HTMLElement[] = [];
    for (const el of els) {
      if (el.getBoundingClientRect().top < fold) reveal(el);
      else staged.push(el);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          reveal(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    for (const el of staged) io.observe(el);

    const par = Array.from(
      document.querySelectorAll<HTMLElement>("[data-par]")
    );
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        for (const el of par) {
          const f = parseFloat(el.dataset.par || "0");
          el.style.transform = `translate3d(0, ${(y * f).toFixed(2)}px, 0)`;
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const failsafe = window.setTimeout(() => els.forEach(reveal), 9000);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(failsafe);
      root.removeAttribute("data-motion");
    };
  }, []);

  return null;
}

/**
 * Ticks a figure up to the value already printed in the markup.
 *
 * Only the first run of digits is animated and whatever surrounds it is kept,
 * so "<30s" counts to 30 and keeps its "<" and "s". The formatter is pinned to
 * en-US: the served HTML carries the en-US string, and re-formatting in the
 * visitor's locale would swap the separators the moment the count finished.
 */
function countUp(el: HTMLElement) {
  if (el.dataset.counted) return;
  const raw = el.dataset.count || el.textContent || "";
  const m = raw.match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return;

  const [, prefix, numStr, suffix] = m;
  const target = parseFloat(numStr.replace(/,/g, ""));
  if (!isFinite(target)) return;

  el.dataset.counted = "1";
  const decimals = (numStr.split(".")[1] || "").length;
  const grouped = numStr.includes(",");
  const opts = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  };
  const t0 = performance.now();

  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / COUNT_MS);
    const v = target * (1 - Math.pow(1 - k, 3)); // easeOutCubic, as the design
    const out = grouped
      ? v.toLocaleString("en-US", opts)
      : v.toFixed(decimals);
    el.textContent = prefix + out + suffix;
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
