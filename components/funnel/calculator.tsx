"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { AuSlider } from "@/components/aurum/slider";
import {
  AuButton,
  AuCard,
  AuEyebrow,
} from "@/components/aurum/primitives";
import { spring, prefersReducedMotion } from "@/components/aurum/motion";
import { ASSUMPTIONS, computeEstimate, money, useFunnel } from "./state";

/**
 * The funnel's qualifying step.
 *
 * It is not here to impress anyone with maths. It is here because a visitor
 * who moves three sliders has spent thirty seconds thinking about their own
 * revenue gap, and arrives at the booking form already persuaded by a number
 * they built themselves rather than one we asserted. The result travels with
 * them into the form, so the call opens on their figures.
 *
 * Every assumption behind the number is printed underneath. A calculator that
 * hides its multipliers gets read as a slot machine, and a prospect who
 * catches that is gone.
 */
export function RoiCalculator() {
  const { setEstimate } = useFunnel();

  const [dms, setDms] = React.useState(80);
  const [deal, setDeal] = React.useState(1200);
  const [fast, setFast] = React.useState(35);

  const estimate = React.useMemo(
    () => computeEstimate(dms, deal, fast),
    [dms, deal, fast]
  );

  // Publish to the funnel context on a microtask rather than during render.
  React.useEffect(() => {
    setEstimate(estimate);
  }, [estimate, setEstimate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,25rem)] lg:gap-10">
      {/* The grid stretches both cards to the taller one (the result panel),
          so the sliders are spread down the card rather than stacked at the
          top with a pool of dead space underneath. */}
      <AuCard className="flex flex-col p-6 sm:p-8">
        <AuEyebrow>Three questions</AuEyebrow>
        <div className="mt-7 flex flex-1 flex-col justify-between gap-8">
          <AuSlider
            id="calc-dms"
            label="DMs and comments you get a week"
            value={dms}
            min={10}
            max={600}
            step={5}
            onChange={setDms}
            format={(v) => (v >= 600 ? "600+" : String(v))}
          />
          <AuSlider
            id="calc-deal"
            label="What one new client is worth"
            value={deal}
            min={100}
            max={6000}
            step={50}
            onChange={setDeal}
            format={money}
          />
          <AuSlider
            id="calc-fast"
            label="Share you answer within the hour, honestly"
            value={fast}
            min={0}
            max={100}
            step={1}
            onChange={setFast}
            format={(v) => `${v}%`}
          />
        </div>
      </AuCard>

      {/* The result panel is the page's one dark surface before the closing
          band. Inverting it makes the number the brightest thing on screen
          without making the number bigger. */}
      <AuCard
        elevation="float"
        className="flex flex-col justify-between border-au-obsidian-line bg-au-obsidian p-6 sm:p-8"
      >
        <div>
          <AuEyebrow tone="dark">Left on the table</AuEyebrow>

          <div className="mt-6">
            <Ticker value={estimate.recoveredRevenue} />
            <p className="mt-3 text-[14.5px] font-semibold text-au-on-dark">
              a month, at your numbers
            </p>
          </div>

          <div className="mt-7 border-t border-au-obsidian-line pt-6">
            <div className="au-num text-[28px] leading-none text-au-on-dark">
              {estimate.recoveredConversations.toLocaleString("en-US")}
            </div>
            <p className="mt-2.5 text-[14px] leading-snug text-au-on-dark-2">
              conversations a month that currently go cold and wouldn&rsquo;t.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <AuButton asChild size="lg" block>
            <a href="#book">
              Walk me through this
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          </AuButton>
          <p className="au-caption mt-4 text-au-on-dark-2">
            Estimate only. Assumes SpeedSettr answers{" "}
            {Math.round(ASSUMPTIONS.coverage * 100)}% of conversations inside a
            minute, {Math.round(ASSUMPTIONS.bookRate * 100)}% of those book a
            call, and you close {Math.round(ASSUMPTIONS.closeRate * 100)}% of
            the calls you take. Change any of those on the call and the number
            moves.
          </p>
        </div>
      </AuCard>
    </div>
  );
}

/**
 * The headline figure, animated toward each new value rather than snapped.
 *
 * It springs because the slider is a continuous gesture: a number that jumps
 * in hard steps while a finger is still moving breaks the sense that the two
 * are the same object. It is critically damped - this is a readout, not a
 * thing that was thrown, so it must not overshoot past the true value even
 * for a frame.
 */
function Ticker({ value }: { value: number }) {
  const [shown, setShown] = React.useState(value);
  const springRef = React.useRef<ReturnType<typeof spring> | null>(null);
  const liveRef = React.useRef(value);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      liveRef.current = value;
      setShown(value);
      return;
    }
    // Interrupt from the CURRENT painted value, never from the previous
    // target, or every slider move produces a visible jump before the ease.
    springRef.current?.stop();
    springRef.current = spring(
      liveRef.current,
      value,
      (v) => {
        liveRef.current = v;
        setShown(v);
      },
      { damping: 1, response: 0.4 }
    );
    return () => springRef.current?.stop();
  }, [value]);

  return (
    <div
      className="au-num text-[clamp(2.75rem,7vw,3.75rem)] leading-none text-au-gold"
      // The spring fires ~60 times a second; announcing each frame would make
      // the page unusable with a screen reader. The settled value is exposed
      // on the container instead.
      aria-live="off"
    >
      <span className="sr-only">{money(value)} a month</span>
      <span aria-hidden="true">{money(Math.round(shown))}</span>
    </div>
  );
}
