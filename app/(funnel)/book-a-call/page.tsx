import type { Metadata } from "next";
import { AuScrollMotion } from "@/components/aurum/reveal";
import { AuEyebrow, AuSection } from "@/components/aurum/primitives";
import { BookingForm } from "@/components/funnel/booking";
import { RoiCalculator } from "@/components/funnel/calculator";
import { Faq } from "@/components/funnel/faq";
import { FunnelNav, StickyBookBar } from "@/components/funnel/nav";
import { FunnelProvider } from "@/components/funnel/state";
import {
  FinalCta,
  FunnelFooter,
  Hero,
  HowItWorks,
  Proof,
  ProofBar,
  TheCall,
  TheGap,
} from "@/components/funnel/sections";

/**
 * The booking funnel, built on Aurum (styles/aurum.css).
 *
 * THE FUNNEL'S SHAPE, and why each block is where it is:
 *
 *   Hero .......... one promise, one action, and a live demo rather than a
 *                   claim. The CTA is above the fold on every viewport.
 *   Proof bar ..... four numbers, so scepticism is answered before the pitch.
 *   The gap ....... the stakes, quantified. Costs them something to keep
 *                   doing nothing.
 *   Your numbers .. the qualifying step. Three sliders turn an abstract
 *                   problem into THEIR number, and that number rides along
 *                   into the booking form.
 *   How it works .. only now, once they want the outcome, does mechanism
 *                   matter. Three steps, one of which is theirs.
 *   Proof ......... social proof placed at the point of peak desire.
 *   The call ...... friction removal. What happens, and what does not.
 *   Book .......... the form. Time first, details second.
 *   FAQ ........... the objections that survive everything above.
 *   Final band .... one last ask for the visitor who read to the bottom.
 *
 * A single conversion action runs the whole page: every button on it goes to
 * #book, and the nav and mobile bar keep that action reachable from any
 * scroll position.
 */

export const metadata: Metadata = {
  title: "Book a 20-minute call | SpeedSettr",
  description:
    "See what unanswered DMs are costing you, then book a 20-minute call. We open your real inbox and draft live replies in your voice.",
  alternates: { canonical: "/book-a-call" },
};

export default function BookACallPage() {
  return (
    <FunnelProvider>
      <AuScrollMotion />
      <FunnelNav />

      {/* Keyboard users reach the nav first; this lets them jump the whole
          header in one keystroke. Visible only while focused. */}
      <a
        href="#book"
        className="au-press sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-au-ctl focus:bg-au-gold focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-au-ink"
      >
        Skip to booking
      </a>

      <main>
        <Hero />
        <ProofBar />
        <TheGap />

        <AuSection id="your-numbers">
          <div className="max-w-[42rem]">
            <AuEyebrow>Your numbers</AuEyebrow>
            <h2 className="au-title-1 mt-4 text-balance text-au-ink">
              Move three sliders. See the gap in your own money.
            </h2>
            <p className="au-body-lg mt-5 text-pretty text-au-ink-2">
              Rough, deliberately conservative, and every assumption is printed
              under the result. We will pull the real figures from your inbox
              on the call.
            </p>
          </div>
          <div className="mt-12">
            <RoiCalculator />
          </div>
        </AuSection>

        <HowItWorks />
        <Proof />
        <TheCall />

        <AuSection id="book" tone="sunk">
          <div className="mx-auto max-w-[38rem] text-center">
            <AuEyebrow>Book it</AuEyebrow>
            <h2 className="au-title-1 mt-4 text-balance text-au-ink">
              Pick a time. That&rsquo;s the whole commitment.
            </h2>
          </div>
          <div className="mx-auto mt-12 max-w-[46rem]">
            <BookingForm />
          </div>
        </AuSection>

        <AuSection>
          <div className="max-w-[42rem]">
            <AuEyebrow>Still deciding</AuEyebrow>
            <h2 className="au-title-1 mt-4 text-balance text-au-ink">
              The five things everyone asks.
            </h2>
          </div>
          <div className="mt-12">
            <Faq />
          </div>
        </AuSection>

        <FinalCta />
      </main>

      <FunnelFooter />
      <StickyBookBar />
    </FunnelProvider>
  );
}
