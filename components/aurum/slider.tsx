"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  clamp,
  prefersReducedMotion,
  rubberband,
  spring,
  VelocityTracker,
  type SpringHandle,
} from "./motion";

/**
 * A slider built the way a physical control behaves.
 *
 * Five things separate this from an <input type=range> with a skin:
 *
 *  1. It tracks the pointer 1:1 and respects WHERE the handle was grabbed.
 *     Snapping the handle's centre to the finger on pointer-down is the single
 *     most common tell that a drag is faked.
 *  2. It uses setPointerCapture, so the drag survives the pointer leaving the
 *     track - you can drag up and away and still be adjusting the value.
 *  3. Past the ends it rubber-bands instead of stopping dead.
 *  4. On release it lands on the step under the finger. It does NOT project
 *     momentum: a flick should throw a sheet, but a slider is a value you are
 *     setting, and it belongs where you let go.
 *  5. The landing is a spring seeded with the finger's exit velocity, so
 *     there is no visible seam between dragging and animating - and because a
 *     spring animates from its current value, grabbing it mid-flight just
 *     works.
 *
 * It remains a real slider to assistive tech: role, aria-value*, and arrow /
 * Home / End keys all behave.
 */
export function AuSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  id,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  id?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const springRef = React.useRef<SpringHandle | null>(null);
  const tracker = React.useRef(new VelocityTracker());
  const grabOffset = React.useRef(0);

  // A pointer sequence is gated on a REF, not on React state.
  //
  // setDragging(true) in pointerdown does not take effect until React commits
  // the next render, but pointermove can fire before that commit - so a
  // handler that checks the state variable reads `false` and silently drops
  // the start of the drag. The failure is input-speed dependent, which is the
  // worst kind: fine when you drag slowly, broken on a quick flick, and
  // invisible in a component test that only presses arrow keys.
  //
  // The ref is the truth for logic; the state below exists only so the handle
  // can restyle itself while held.
  const draggingRef = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);

  // The value the handle is PAINTED at. It equals `value` at rest, but during
  // a drag it can sit outside [min,max] (rubber-band) or between steps, and
  // during the landing spring it holds the live interpolated value. Reading
  // this - never the target - is what makes an interrupted animation resume
  // from where it visibly is instead of jumping.
  const [display, setDisplay] = React.useState(value);
  React.useEffect(() => {
    // Reads the ref rather than the state for the same reason as above: this
    // runs after commit, so the ref is current and a mid-drag parent update
    // cannot yank the handle out from under the finger.
    if (!draggingRef.current) setDisplay(value);
  }, [value, dragging]);

  const span = max - min;
  const pct = clamp(((display - min) / span) * 100, -6, 106);

  const snap = React.useCallback(
    (v: number) => clamp(Math.round(v / step) * step, min, max),
    [step, min, max]
  );

  /** Pointer x -> value, in value units, honouring the original grab offset. */
  const valueAt = React.useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return value;
      const x = clientX - rect.left - grabOffset.current;
      const raw = min + (x / rect.width) * span;
      if (raw >= min && raw <= max) return raw;
      // Outside the ends, resistance grows with how far past you pull.
      const over = raw > max ? raw - max : raw - min;
      return (raw > max ? max : min) + rubberband(over, span * 0.5);
    },
    [min, max, span, value]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the primary button; a right-click must not start a drag.
    if (e.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    springRef.current?.stop();
    springRef.current = null;

    const rect = track.getBoundingClientRect();
    const handleX = rect.left + ((value - min) / span) * rect.width;
    const dx = e.clientX - handleX;

    // Grabbing the handle keeps the offset so the handle does not teleport
    // under the finger. Pressing the bare track is a different gesture - an
    // intent to go THERE - so it centres and takes effect immediately.
    const HANDLE_RADIUS = 22;
    grabOffset.current = Math.abs(dx) <= HANDLE_RADIUS ? dx : 0;

    track.setPointerCapture(e.pointerId);
    tracker.current.reset();
    draggingRef.current = true;
    setDragging(true);

    const next = valueAt(e.clientX);
    setDisplay(next);
    tracker.current.add(next);
    onChange(snap(next));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // Feedback is continuous THROUGH the gesture, not saved up for the end.
    const next = valueAt(e.clientX);
    setDisplay(next);
    tracker.current.add(next);
    onChange(snap(next));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    trackRef.current?.releasePointerCapture?.(e.pointerId);

    const v = tracker.current.velocity(); // value-units per second
    const current = display;

    // NO momentum projection here, deliberately.
    //
    // Projecting a flick forward is right for something you THROW - a sheet,
    // a carousel, a scroll view - where the gesture is "send this away and
    // let physics decide where it lands". A slider is the opposite kind of
    // object: it is a value you are setting, and the value is wherever your
    // finger stopped. An earlier build did project the release here, and a
    // quick drag to ~4,500 landed on 5,650 - the control overshooting the
    // number the person had just chosen. That is the interface arguing with
    // its user.
    //
    // What survives from the gesture is the SEAM fix below: the release
    // velocity is still handed to the spring, so the handle settles into its
    // step carrying the motion the finger had, with no visible cut between
    // dragging and animating.
    const target = snap(current);

    onChange(target);

    if (prefersReducedMotion()) {
      setDisplay(target);
      return;
    }

    springRef.current?.stop();
    springRef.current = spring(current, target, setDisplay, {
      // Critically damped. With the projection gone, the handle is settling
      // into the step under the finger rather than flying to a new one, and
      // a readout that bounces past its own value - even for two frames - is
      // a number the reader cannot trust.
      damping: 1,
      response: 0.3,
      velocity: v,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = Math.max(step, Math.round(span / 10 / step) * step);
    const map: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: big,
      PageDown: -big,
    };
    if (e.key in map) {
      e.preventDefault();
      onChange(snap(value + map[e.key]));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  const text = format ? format(value) : String(value);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[14px] font-semibold text-au-ink-2"
        >
          {label}
        </label>
        <output
          htmlFor={id}
          className="au-num text-[19px] leading-none text-au-ink"
        >
          {text}
        </output>
      </div>

      <div
        ref={trackRef}
        id={id}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          // A 40px tall, transparent hit area around a 6px visible track: the
          // control is thin to look at and thumb-sized to actually use.
          "relative mt-3.5 flex h-10 cursor-grab touch-none items-center rounded-au-ctl",
          dragging && "cursor-grabbing"
        )}
      >
        <div className="relative h-1.5 w-full rounded-au-pill bg-au-canvas-sunk ring-1 ring-inset ring-au-line">
          <div
            className="absolute inset-y-0 left-0 rounded-au-pill bg-au-gold"
            style={{ width: `${clamp(pct, 0, 100)}%` }}
          />
        </div>

        <div
          className={cn(
            "pointer-events-none absolute top-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-au-line-strong bg-au-surface-raised shadow-au-2",
            // The handle grows a touch under the finger - the object
            // acknowledges the grab before the value has even moved.
            "transition-[box-shadow,width,height] duration-150 ease-au-out",
            dragging && "h-[30px] w-[30px] shadow-au-3"
          )}
          style={{ left: `${pct}%` }}
        >
          <span className="absolute inset-[7px] rounded-full bg-au-gold" />
        </div>
      </div>
    </div>
  );
}
