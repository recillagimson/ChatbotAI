import * as React from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  MessagesSquare,
  MoonStar,
  Quote,
  ShieldCheck,
  Timer,
} from "lucide-react";
import {
  AuButton,
  AuCard,
  AuEyebrow,
  AuPill,
  AuRule,
  AuSection,
  AuSectionHead,
  AuStat,
} from "@/components/aurum/primitives";
import { COMPANY } from "@/lib/company";
import { DmDemo } from "./dm-demo";

/* ------------------------------------------------------------------ Hero */

/**
 * One promise, one action.
 *
 * There is a secondary link, but it is a text link rather than a second
 * button: two buttons of equal weight make the visitor choose, and a funnel
 * with one goal should never ask them to.
 */
export function Hero() {
  return (
    <div id="top" className="au-bloom relative overflow-hidden bg-au-canvas">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-14 px-5 pb-[clamp(4rem,8vw,6rem)] pt-[clamp(7rem,12vw,10rem)] sm:px-8 lg:grid-cols-[1.05fr_minmax(0,27rem)] lg:gap-16">
        <div>
          <AuPill tone="gold">
            <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
            Answering at 2am, in your voice
          </AuPill>

          <h1 className="au-display mt-7 text-balance text-au-ink">
            Your best lead messaged you{" "}
            {/* The one coloured phrase in the headline. Gold marks the point
                of the sentence, and the page has already taught the eye that
                gold is where the value is. */}
            <span className="text-au-gold-ink">nine hours ago</span>.
          </h1>

          <p className="au-body-lg mt-6 max-w-[34rem] text-pretty text-au-ink-2">
            SpeedSettr answers every Instagram, Messenger, WhatsApp, Telegram
            and TikTok DM in under a minute — trained on your offers, written
            in your voice — and hands you the chat the moment someone is ready
            to buy.
          </p>

          <div
            id="hero-cta"
            className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4"
          >
            <AuButton asChild size="xl">
              <a href="#book">
                Book my 20-minute call
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </AuButton>
            <a
              href="#your-numbers"
              className="au-press rounded-au-chip text-[15px] font-semibold text-au-ink-2 underline decoration-au-line-strong decoration-2 underline-offset-[6px] hover:text-au-ink hover:decoration-au-gold"
            >
              See what it&rsquo;s costing you first
            </a>
          </div>

          <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            {[
              "No card to see it work",
              "Live the same week",
              "Cancel any month",
            ].map((t) => (
              <li
                key={t}
                className="flex items-center gap-2 text-[13.5px] font-medium text-au-ink-3"
              >
                <Check
                  className="h-4 w-4 text-au-good"
                  aria-hidden="true"
                />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div data-au-reveal>
          <DmDemo />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- ProofBar */

export function ProofBar() {
  const stats = [
    { value: "<30s", label: "Typical first reply", sub: "Day or night, every channel" },
    { value: "5", label: "Channels, one brain", sub: "IG, Messenger, WhatsApp, Telegram, TikTok" },
    { value: "24/7", label: "Never off, never asleep", sub: "Including the 2am ones" },
    { value: "1 week", label: "From signup to live", sub: "One session to train it" },
  ];
  return (
    <div className="border-y border-au-line bg-au-surface">
      <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {stats.map((s) => (
          <AuStat key={s.label} {...s} />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- The gap */

/**
 * The stakes, quantified and specific. Generic pain ("you're losing leads!")
 * gets skimmed; a number with a mechanism behind it gets read.
 */
export function TheGap() {
  const cards = [
    {
      icon: Timer,
      stat: "5 minutes",
      title: "The window is shorter than your lunch",
      body: "Reply inside five minutes and a lead is many times likelier to qualify than at thirty. Most businesses answer DMs in hours, and the difference is not effort — it is that nobody is holding the phone at 11pm.",
    },
    {
      icon: MoonStar,
      stat: "1 in 3",
      title: "A third of your DMs land while you sleep",
      body: "Evenings and weekends are when people scroll, and that is exactly when nobody is answering. The message is still there in the morning. The buying mood is not.",
    },
    {
      icon: MessagesSquare,
      stat: "Silence",
      title: "Nobody sends a second message",
      body: "A lead who is ignored does not chase you. They open the next account in the search results — and you never learn that the conversation existed.",
    },
  ];

  return (
    <AuSection id="the-gap" tone="sunk">
      <AuSectionHead
        eyebrow="The gap"
        title="You are not losing leads to your competitors. You are losing them to a delay."
        body="Nothing is wrong with your offer. The conversations simply happen at hours when there is no one to have them."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {cards.map((c) => (
          <AuCard key={c.title} className="p-7" data-au-reveal>
            <c.icon className="h-6 w-6 text-au-gold-ink" aria-hidden="true" />
            <div className="au-num mt-6 text-[30px] leading-none text-au-ink">
              {c.stat}
            </div>
            <h3 className="au-title-3 mt-4 text-au-ink">{c.title}</h3>
            <p className="au-callout mt-3 text-au-ink-2">{c.body}</p>
          </AuCard>
        ))}
      </div>
    </AuSection>
  );
}

/* ---------------------------------------------------------- How it works */

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "We train it on your business",
      body: "One session. You talk, we load your offers, your prices, your objections and the three answers you are tired of typing. Drop in a PDF if you have one.",
    },
    {
      n: "02",
      title: "It answers everything, everywhere",
      body: "Every channel, every hour. It waits a human beat, groups rapid-fire messages into one reply, and never invents a price it was not given.",
    },
    {
      n: "03",
      title: "It hands you the ones worth your time",
      body: "Ready to buy. Asking for a call. Off-script. The AI steps back and your inbox says who is waiting and for how long — one inbox for all five channels.",
    },
  ];

  return (
    <AuSection id="how-it-works">
      <AuSectionHead
        eyebrow="How it works"
        title="Three steps, and only one of them is yours."
      />
      <ol className="mt-14 grid gap-px overflow-hidden rounded-au-panel border border-au-line bg-au-line md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="bg-au-surface p-7 sm:p-8" data-au-reveal>
            <span className="au-num text-[13px] tracking-[0.1em] text-au-gold-ink-sm">
              {s.n}
            </span>
            <h3 className="au-title-3 mt-5 text-au-ink">{s.title}</h3>
            <p className="au-callout mt-3 text-au-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </AuSection>
  );
}

/* --------------------------------------------------------------- Social */

export function Proof() {
  return (
    <AuSection tone="sunk">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <AuCard elevation="float" className="p-8 sm:p-10" data-au-reveal>
          <Quote className="h-7 w-7 text-au-gold" aria-hidden="true" />
          <blockquote className="au-title-2 mt-6 text-balance text-au-ink">
            &ldquo;I stopped checking my phone at midnight. The bookings kept
            coming anyway — that is the whole review.&rdquo;
          </blockquote>
          <figcaption className="mt-7 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-au-canvas-sunk text-[13px] font-bold text-au-ink-2">
              MR
            </span>
            <span>
              <span className="block text-[14.5px] font-semibold text-au-ink">
                Marco R.
              </span>
              <span className="au-caption block text-au-ink-3">
                1:1 coaching · Phoenix
              </span>
            </span>
          </figcaption>
        </AuCard>

        <div className="flex flex-col justify-center gap-8" data-au-reveal>
          <AuStat
            value="3.4×"
            label="More conversations reaching a booked call"
            sub="Across accounts in their first 60 days"
          />
          <AuRule />
          <AuStat
            value="41s"
            label="Median first reply, measured"
            sub="Not a target — the number the dashboard reports"
          />
        </div>
      </div>
    </AuSection>
  );
}

/* ------------------------------------------------------------- The call */

/**
 * Friction removal, immediately before the form.
 *
 * The single largest reason a warm visitor does not book is not price — it is
 * not knowing what the twenty minutes will be like. Saying it plainly, including
 * what we will NOT do, costs one section and buys the click.
 */
export function TheCall() {
  const agenda = [
    "We open your actual DMs and read the last fortnight together.",
    "We draft live replies to three real messages, in your voice.",
    "You get the honest number: what this recovers, and what it costs.",
  ];
  const nots = [
    "No slide deck.",
    "No card, no contract on the call.",
    "If your volume is too low, we say so and you leave.",
  ];

  return (
    <AuSection id="the-call" tone="tint">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <AuSectionHead
            eyebrow="The call"
            title="Twenty minutes, and you will know either way."
            body="Here is exactly what happens, so you are not booking into a question mark."
          />
          <AuPill tone="gold" className="mt-7">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            20 minutes · video · no prep needed
          </AuPill>
        </div>

        <div className="space-y-8">
          <div data-au-reveal>
            <AuEyebrow>What we do</AuEyebrow>
            <ul className="mt-5 space-y-3.5">
              {agenda.map((a) => (
                <li key={a} className="flex gap-3">
                  <Check
                    className="mt-0.5 h-5 w-5 shrink-0 text-au-good"
                    aria-hidden="true"
                  />
                  <span className="au-callout text-au-ink-2">{a}</span>
                </li>
              ))}
            </ul>
          </div>

          <AuRule />

          <div data-au-reveal>
            <AuEyebrow tone="muted">What we don&rsquo;t</AuEyebrow>
            <ul className="mt-5 space-y-3.5">
              {nots.map((a) => (
                <li key={a} className="flex gap-3">
                  <ShieldCheck
                    className="mt-0.5 h-5 w-5 shrink-0 text-au-ink-4"
                    aria-hidden="true"
                  />
                  <span className="au-callout text-au-ink-2">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AuSection>
  );
}

/* ------------------------------------------------------------ Final band */

export function FinalCta() {
  return (
    <AuSection tone="dark">
      <div className="mx-auto max-w-[44rem] text-center">
        <AuEyebrow tone="dark">Last thing</AuEyebrow>
        <h2 className="au-title-1 mt-5 text-balance text-au-on-dark">
          Someone is typing to you right now.
        </h2>
        <p className="au-body-lg mx-auto mt-5 max-w-[34rem] text-pretty text-au-on-dark-2">
          Twenty minutes to find out whether that message turns into money.
          Worst case, you get a read on your own inbox for free.
        </p>
        <div className="mt-9 flex justify-center">
          <AuButton asChild size="xl">
            <a href="#book">
              Book my 20-minute call
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </AuButton>
        </div>
      </div>
    </AuSection>
  );
}

/* ---------------------------------------------------------------- Footer */

export function FunnelFooter() {
  return (
    <footer className="border-t border-au-obsidian-line bg-au-obsidian px-5 pb-12 pt-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-au text-[16px] font-bold tracking-[-0.02em] text-au-on-dark">
            SpeedSettr
          </div>
          <p className="au-caption mt-2 text-au-on-dark-2">
            {COMPANY.name} · {COMPANY.address}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a
            href={`mailto:${COMPANY.email}`}
            className="au-caption rounded-au-chip text-au-on-dark-2 hover:text-au-on-dark"
          >
            {COMPANY.email}
          </a>
          <a
            href="/privacy"
            className="au-caption rounded-au-chip text-au-on-dark-2 hover:text-au-on-dark"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="au-caption rounded-au-chip text-au-on-dark-2 hover:text-au-on-dark"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
