"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/components/aurum/motion";

/**
 * The one element on the page that SHOWS the product instead of describing it:
 * a DM arriving at 2am and being answered before the clock finishes counting.
 *
 * The timer is the point. The whole pitch is speed-to-lead, so the proof has
 * to be a number that visibly moves, not a claim in a paragraph.
 */

type Step = { role: "lead" | "bot"; text: string; at: number };

const SCRIPT: Step[] = [
  { role: "lead", text: "hey, do you take clients in Phoenix?", at: 900 },
  {
    role: "bot",
    text: "We do — Phoenix is one of our bigger markets. Are you looking for the 1:1 programme or the group one?",
    at: 2600,
  },
  { role: "lead", text: "1:1. what's the damage?", at: 4200 },
  {
    role: "bot",
    text: "It's $2,400 for the 12 weeks, and that includes weekly calls. Want me to put you on Marco's calendar this week?",
    at: 6000,
  },
  { role: "lead", text: "yes please 🙌", at: 7600 },
];

const LOOP_AT = 10200;

export function DmDemo() {
  const [elapsed, setElapsed] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      // Reduced motion gets the END state, not a blank box: the information is
      // the conversation, and withholding it would be an accessibility
      // regression dressed up as a motion preference.
      setReduced(true);
      setElapsed(LOOP_AT);
      return;
    }

    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = (now - start) % LOOP_AT;
      setElapsed(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = SCRIPT.filter((s) => elapsed >= s.at);
  const next = SCRIPT.find((s) => elapsed < s.at);
  // The bot "types" for the 900ms before its message lands - the same beat a
  // person would take. An instant reply reads as a machine; this reads as
  // someone who was awake.
  const typing = !!next && next.role === "bot" && elapsed >= next.at - 900;

  // The clock runs only until the first reply, then holds - it is measuring
  // response time, not elapsed page time.
  const firstReply = SCRIPT.find((s) => s.role === "bot")!;
  const clockMs = Math.min(elapsed, firstReply.at) - SCRIPT[0].at;
  const seconds = Math.max(0, clockMs / 1000);

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-au-hero border border-au-line bg-au-surface shadow-au-4">
        {/* Header: who is messaging, and the fact that it is the middle of
            the night - which is the whole argument in one line. */}
        <div className="flex items-center gap-3 border-b border-au-line-soft px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-au-canvas-sunk text-[13px] font-bold text-au-ink-2">
            DR
          </div>
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold leading-tight text-au-ink">
              @dana.rueda
            </div>
            <div className="au-caption text-au-ink-3">Instagram · 2:14 AM</div>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-au-pill bg-au-good-wash px-2.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="au-pulse absolute inset-0 text-au-good" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-au-good" />
            </span>
            <span className="text-[11.5px] font-bold text-au-good">Live</span>
          </div>
        </div>

        {/* aria-live so a screen reader follows the exchange as it arrives,
            rather than being told a static box exists. */}
        <div
          className="flex min-h-[318px] flex-col justify-end gap-2.5 px-5 py-5"
          aria-live={reduced ? "off" : "polite"}
        >
          {visible.map((s, i) => (
            <Bubble key={`${s.at}-${i}`} role={s.role} reduced={reduced}>
              {s.text}
            </Bubble>
          ))}
          {typing ? (
            <div className="self-start rounded-au-card rounded-bl-[6px] border border-au-line bg-au-canvas-sunk px-4 py-3">
              <span className="flex gap-1" aria-label="Typing">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-au-ink-4"
                    style={{
                      animation: "auDot 1.1s ease-in-out infinite",
                      animationDelay: `${d * 140}ms`,
                    }}
                  />
                ))}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-au-line-soft bg-au-canvas px-5 py-3.5">
          <span className="au-eyebrow text-au-ink-3">Replied in</span>
          <span className="au-num text-[22px] leading-none text-au-gold-ink">
            {seconds.toFixed(1)}s
          </span>
        </div>
      </div>

      <style>{`@keyframes auDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
      @media (prefers-reduced-motion: reduce){@keyframes auDot{0%,100%{opacity:.6;transform:none}}}`}</style>
    </div>
  );
}

function Bubble({
  role,
  children,
  reduced,
}: {
  role: "lead" | "bot";
  children: React.ReactNode;
  reduced: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-[86%] px-4 py-3 text-[14.5px] leading-[1.5]",
        role === "lead"
          ? "self-start rounded-au-card rounded-bl-[6px] border border-au-line bg-au-canvas-sunk text-au-ink-2"
          : // The bot's bubble is the gold one. Gold marks the thing the page
            // wants you to notice, and here that is the product speaking.
            "self-end rounded-au-card rounded-br-[6px] bg-au-gold text-au-ink shadow-au-1",
        !reduced && "animate-[auPop_0.42s_cubic-bezier(0.32,0.72,0,1)_both]"
      )}
    >
      {children}
      <style>{`@keyframes auPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
