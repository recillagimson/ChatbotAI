"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Scroll reveal, mounted once per page.
 *
 * The hidden state in styles/aurum.css is gated on [data-au-motion] on <html>,
 * and this effect is the only thing that ever sets it. So if JavaScript fails,
 * never loads, or the visitor has asked for reduced motion, the attribute is
 * absent and every block renders in its final position - content can never be
 * stranded at opacity 0 by a script that didn't run.
 */
export function AuScrollMotion() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const root = document.documentElement;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-au-reveal]")
    );
    if (!nodes.length) return;

    root.setAttribute("data-au-motion", "");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // Siblings inside one group cascade rather than arriving together;
          // 90ms is long enough to read as a sequence, short enough that the
          // last item is never waiting on the first.
          const group = el.parentElement
            ? Array.from(el.parentElement.children).indexOf(el)
            : 0;
          el.style.setProperty(
            "--au-reveal-delay",
            `${Math.min(group, 5) * 90}ms`
          );
          el.setAttribute("data-au-shown", "");
          io.unobserve(el);
        }
      },
      // Fire a little before the element's top edge arrives, so the motion is
      // finishing as it reaches comfortable reading position rather than
      // starting there.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    nodes.forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      root.removeAttribute("data-au-motion");
    };
  }, []);

  return null;
}
