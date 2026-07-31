import { CheckCircle2, Clock, Zap } from "lucide-react";
import { PLAN_FEATURES, PRICING } from "@/lib/pricing";

/**
 * The two pieces of brand content the auth screens carry: the note above the
 * sign-in card and the rail beside the sign-up form.
 *
 * There are no measured statistics here. The design put a live counter above
 * the sign-in fields ("41 DMs answered · 3 leads waiting on you"), which is not
 * something a signed-out page can know - it has no session, so any number it
 * shows is invented. The note keeps the slot and the reason-to-log-in, and says
 * only what is true of the product itself.
 *
 * The rail's inclusions are `PLAN_FEATURES` from lib/pricing, the same array
 * Billing and the public pricing card render, so the three can't drift.
 */

/** Sits above the sign-in card. */
export function WelcomeNote() {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-white/[0.1] bg-white/[0.05] px-4 py-3.5">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-ctl bg-[#34d399]/[0.16]">
        <Zap className="h-[17px] w-[17px] text-[#34d399]" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold leading-none text-white">
          While you were away
        </div>
        <p className="mt-1.5 text-[11.5px] leading-[1.4] text-[#a5a2d0]">
          Your AI answers around the clock. Sign in to see what it handled.
        </p>
      </div>
    </div>
  );
}

/** Mirrors the four steps on /onboarding, in the same order. */
const SETUP_STEPS = [
  "Account",
  "Activate your plan",
  "Teach it your business",
  "Connect ManyChat",
];

/** The right-hand rail on sign-up. */
export function SignupAside() {
  return (
    <div className="flex h-full flex-col">
      <div className="text-[10.5px] font-bold uppercase leading-none tracking-[0.14em] text-[#8b88b8]">
        What you get
      </div>

      {/* The price, plainly. The design led with "14 days free" and "no card
          until day 14" - there is no trial: the Stripe checkout session sets no
          trial_period_days, so the first invoice is the full amount. */}
      <div className="mt-3.5 flex items-baseline gap-2">
        <span className="font-display text-[30px] font-bold leading-none tabular-nums text-white">
          ${PRICING.monthly}
        </span>
        <span className="text-[12.5px] font-medium leading-none text-[#b6b4dd]">
          / month
        </span>
      </div>
      <p className="mt-2 text-xs leading-[1.55] text-[#8b88b8]">
        Or ${PRICING.annualPerMonth}/mo billed yearly. No card to create your
        account, and you can cancel from Billing at any time.
      </p>

      <ul className="mt-5 flex flex-col gap-2.5 border-t border-white/[0.09] pt-5">
        {PLAN_FEATURES.map((f) => (
          <li
            key={f}
            className="flex gap-2 text-[12px] leading-[1.45] text-white"
          >
            <CheckCircle2
              className="mt-px h-[15px] w-[15px] shrink-0 text-[#34d399]"
              aria-hidden
            />
            {f}
          </li>
        ))}
      </ul>

      {/* A flex spacer rather than `mt-auto` on the box below. mt-auto pins the
          box to the bottom but collapses to a 0px gap whenever the rail is
          already taller than the form beside it, which butts it against the
          last inclusion. The spacer absorbs slack when there is some and the
          box keeps its own margin when there isn't. */}
      <div className="hidden flex-1 md:block" aria-hidden />

      <div className="mt-6 rounded-panel border border-white/[0.09] bg-white/[0.05] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Clock className="h-[15px] w-[15px] shrink-0 text-[#c084fc]" aria-hidden />
          <span className="font-display text-[11.5px] font-bold leading-none text-white">
            About 10 minutes to live
          </span>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-[1.5] text-[#b6b4dd]">
          {SETUP_STEPS.join(" · ")}
        </p>
      </div>
    </div>
  );
}
