"use client";

import * as React from "react";

/**
 * The funnel's one piece of shared client state.
 *
 * The calculator produces a number; the booking form consumes it. Passing it
 * through context (rather than each component owning its own copy) is what
 * makes the calculator a funnel STEP instead of a toy: the estimate the
 * visitor built for themselves is already on the form when they reach it, and
 * it travels with the submission so the call starts with their numbers
 * already on the table.
 *
 * The provider is a client component wrapping server children passed through
 * `children`, so the sections themselves stay server-rendered.
 */

export type Estimate = {
  dmsPerWeek: number;
  dealValue: number;
  fastReplyPct: number;
  /** Conversations per month that currently go cold and would not. */
  recoveredConversations: number;
  /** Estimated monthly revenue recovered, rounded. */
  recoveredRevenue: number;
};

type FunnelCtx = {
  estimate: Estimate | null;
  setEstimate: (e: Estimate) => void;
  /** Set once the visitor books, so the page can stop selling at them. */
  booked: boolean;
  setBooked: (b: boolean) => void;
};

const Ctx = React.createContext<FunnelCtx | null>(null);

export function FunnelProvider({ children }: { children: React.ReactNode }) {
  const [estimate, setEstimate] = React.useState<Estimate | null>(null);
  const [booked, setBooked] = React.useState(false);
  const value = React.useMemo(
    () => ({ estimate, setEstimate, booked, setBooked }),
    [estimate, booked]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFunnel() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useFunnel must be used inside <FunnelProvider>");
  return ctx;
}

/* ------------------------------------------------------------------------ */

/**
 * The estimate model, kept pure and in one place so the assumptions printed
 * under the calculator cannot drift from the arithmetic above them. Every
 * constant here is shown to the visitor - an ROI calculator whose maths is
 * hidden is a slot machine, and prospects can smell it.
 */
export const ASSUMPTIONS = {
  weeksPerMonth: 4.33,
  /** What SpeedSettr answers inside a minute. Not 100%: it hands off edge cases. */
  coverage: 0.98,
  /** Of fast-answered conversations, how many book. Deliberately conservative. */
  bookRate: 0.12,
  /** Of booked calls, how many close. */
  closeRate: 0.3,
} as const;

export function computeEstimate(
  dmsPerWeek: number,
  dealValue: number,
  fastReplyPct: number
): Estimate {
  const monthly = dmsPerWeek * ASSUMPTIONS.weeksPerMonth;
  const nowFast = monthly * (fastReplyPct / 100);
  const thenFast = monthly * ASSUMPTIONS.coverage;
  // Never negative: a business already answering 98%+ in a minute has no gap
  // to recover, and the calculator should say so rather than invent one.
  const recoveredConversations = Math.max(0, thenFast - nowFast);
  const recoveredRevenue =
    recoveredConversations *
    ASSUMPTIONS.bookRate *
    ASSUMPTIONS.closeRate *
    dealValue;
  return {
    dmsPerWeek,
    dealValue,
    fastReplyPct,
    recoveredConversations: Math.round(recoveredConversations),
    recoveredRevenue: Math.round(recoveredRevenue),
  };
}

export const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
