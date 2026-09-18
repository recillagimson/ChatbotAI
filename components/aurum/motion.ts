/**
 * AURUM motion primitives.
 *
 * CSS transitions are fine for hover and colour, but they cannot be grabbed
 * mid-flight: a transition animates from where it was told to start, so
 * interrupting one makes the element jump. Anything a person can touch is
 * driven by the spring below instead, which always starts from the CURRENT
 * on-screen value and carries the current velocity into the new target.
 */

/** Apple states springs as damping + response, not mass/stiffness/damping. */
export type SpringOpts = {
  /** 1 = critically damped (no overshoot). <1 overshoots. */
  damping?: number;
  /** Seconds to substantially reach the target. Not a duration - a spring has none. */
  response?: number;
  /** Initial velocity in units/second. Hand the pointer's release velocity here. */
  velocity?: number;
};

export type SpringHandle = { stop: () => void };

/**
 * A single-axis spring. Decompose 2D motion into two of these rather than
 * springing a distance - X and Y with different velocities desync otherwise.
 *
 * Returns a handle whose `stop()` is safe to call at any time; calling it and
 * starting a new spring from the value you last received is exactly how an
 * interruption is meant to work.
 */
export function spring(
  from: number,
  to: number,
  onFrame: (value: number) => void,
  { damping = 1, response = 0.4, velocity = 0 }: SpringOpts = {}
): SpringHandle {
  // Standard translation from (damping ratio, response) to (omega, zeta).
  const omega = (2 * Math.PI) / Math.max(response, 0.01);
  const zeta = damping;

  let x = from - to; // displacement from rest
  let v = velocity;
  let raf = 0;
  let last = 0;
  let stopped = false;

  const step = (now: number) => {
    if (stopped) return;
    // First frame has no delta; clamp the rest so a backgrounded tab that
    // resumes with a 2s gap doesn't integrate the spring into the void.
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;

    // Semi-implicit Euler. Stable at these stiffnesses and cheap enough to
    // run several of them per frame.
    const a = -(omega * omega) * x - 2 * zeta * omega * v;
    v += a * dt;
    x += v * dt;

    // Settled: both displacement and velocity below the perception floor.
    if (Math.abs(x) < 0.01 && Math.abs(v) < 0.05) {
      onFrame(to);
      stopped = true;
      return;
    }
    onFrame(to + x);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}

/**
 * Where a flick would come to rest, using Apple's own projection from the
 * Designing Fluid Interfaces sample code. This is exponential decay, NOT the
 * textbook v^2/(2a) - snapping to the nearest point from the RELEASE position
 * is what makes a flick feel dead.
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary. A hard stop reads as "frozen"; this
 * reads as "responsive, but there is nothing more here".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  if (dimension <= 0) return 0;
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

export const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

/**
 * A short position/time history, sampled from pointermove. Velocity taken
 * from only the last two events is noisy - a finger that pauses for one frame
 * before lifting reads as a dead stop - so this averages over a ~90ms window.
 */
export class VelocityTracker {
  private samples: { v: number; t: number }[] = [];

  add(value: number, time = performance.now()) {
    this.samples.push({ v: value, t: time });
    if (this.samples.length > 8) this.samples.shift();
  }

  /** Units per second. Zero when there is not enough history to be honest. */
  velocity(window = 90): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    let first = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (last.t - s[i].t > window) break;
      first = s[i];
    }
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    return ((last.v - first.v) / dt) * 1000;
  }

  reset() {
    this.samples = [];
  }
}

/** One place to ask, so no component invents its own answer. */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
