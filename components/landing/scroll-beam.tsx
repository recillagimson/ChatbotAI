"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The reading-progress beam down the left edge of the dark homepage.
 *
 * Purely decorative, so it is `aria-hidden` and skipped entirely under
 * `prefers-reduced-motion` - a dot that tracks the scroll position is exactly
 * the kind of continuous motion that setting exists to stop.
 *
 * Progress is read off the window rather than a scroll container because the
 * real page scrolls the document, not an inner div like the design mockup did.
 */
export function ScrollBeam() {
  const fillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setEnabled(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let ticking = false;

    const sync = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 8 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const railHeight = window.innerHeight - 160;
      if (fillRef.current) fillRef.current.style.height = `${p * railHeight}px`;
      if (dotRef.current) {
        dotRef.current.style.transform = `translateY(${p * railHeight}px)`;
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        sync();
      });
    };

    sync();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none sticky top-0 z-20 hidden h-0 xl:block"
    >
      <div
        className="absolute left-[26px] top-[80px] w-0.5 rounded-full bg-white/[0.07]"
        style={{ height: "calc(100vh - 160px)" }}
      >
        <div
          ref={fillRef}
          className="absolute left-0 top-0 h-0 w-full rounded-full bg-[linear-gradient(180deg,rgba(124,34,196,.25),#7c22c4_40%,#c084fc)]"
        />
        <div
          ref={dotRef}
          className="absolute -left-[7px] -top-2 h-4 w-4 rounded-full bg-[#c084fc] shadow-[0_0_16px_4px_rgba(192,132,252,.5)]"
        />
      </div>
    </div>
  );
}
