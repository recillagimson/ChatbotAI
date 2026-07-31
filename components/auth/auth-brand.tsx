import Link from "next/link";
import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PRICING } from "@/lib/pricing";

/**
 * The navy brand side of the auth screens.
 *
 * Two variants, because the two screens have different jobs. Signing in is a
 * returning customer, so the panel shows proof the thing works. Signing up is
 * someone deciding, so it shows what happens after the button - the real
 * onboarding sequence from /onboarding, not a shorter invented one.
 *
 * Every number here is either structural (five channels is what
 * lib/platforms.ts defines) or already published on the marketing page. No
 * measured statistics that nobody has measured.
 */

export type AuthVariant = "proof" | "setup";

const PROOF_STATS = [
  // `short` keeps the three-across row on a phone from wrapping.
  { value: "<30s", label: "typical first reply", short: "first reply" },
  { value: "24/7", label: "always answering", short: "answering" },
  { value: "5", label: "channels, one bot", short: "channels" },
];

/** Mirrors the four steps on /onboarding, in the same order. */
const SETUP_STEPS = [
  {
    title: "Create your account",
    body: "Email and password. No card yet.",
  },
  {
    title: "Activate your plan",
    body: `$${PRICING.monthly}/mo, and the AI starts replying.`,
  },
  {
    title: "Teach it your business",
    body: "Name your bot, pick a tone, drop a PDF or type your FAQs.",
  },
  {
    title: "Connect ManyChat",
    body: "One key links Instagram, Facebook, WhatsApp, Telegram and TikTok.",
  },
];

/** The angled light streaks and the corner glow behind the panel content. */
function PanelDecor() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-[74px] h-[340px] w-[3px] rotate-[24deg] bg-white/[0.06]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-[46px] h-[340px] w-2 rotate-[24deg] bg-ss-indigo/[0.26]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-10 h-[260px] w-[260px] rounded-full bg-ss-indigo/[0.12]"
      />
    </>
  );
}

/** Desktop: the fixed 560px navy column. */
export function AuthBrandPanel({ variant }: { variant: AuthVariant }) {
  return (
    <div className="relative hidden shrink-0 flex-col overflow-hidden bg-ss-navy px-12 py-11 lg:flex lg:w-[560px]">
      <PanelDecor />

      <Link href="/" aria-label="SpeedSettr home" className="relative w-fit">
        <Logo white />
      </Link>

      <div className="relative mt-auto">
        {variant === "proof" ? <ProofBody /> : <SetupBody />}
      </div>

      <div className="relative mt-8 flex items-center gap-2.5 text-[11.5px] leading-none text-ss-nav-label">
        {variant === "proof" ? (
          <>
            <Lock className="h-[15px] w-[15px]" aria-hidden />
            Encrypted in transit · payments by Stripe
          </>
        ) : (
          <>
            <ShieldCheck className="h-[15px] w-[15px]" aria-hidden />
            Payments by Stripe · we never store your card
          </>
        )}
      </div>
    </div>
  );
}

function ProofBody() {
  return (
    <>
      <h2 className="text-pretty font-display text-4xl font-bold leading-[1.2] tracking-[-0.02em] text-white">
        Every DM answered in under a minute.
      </h2>
      <p className="mt-4 max-w-[400px] text-pretty text-[14.5px] leading-[1.65] text-ss-nav-text">
        Your AI closer works Instagram, Facebook, WhatsApp, Telegram and TikTok
        while you sleep, and hands you the ones worth a human.
      </p>

      <dl className="mt-8 flex border-y border-white/[0.12] py-5">
        {PROOF_STATS.map(({ value, label }, i) => (
          <div
            key={label}
            className={`flex flex-1 flex-col-reverse ${
              i > 0 ? "border-l border-white/10 pl-[22px]" : ""
            } ${i < PROOF_STATS.length - 1 ? "pr-[22px]" : ""}`}
          >
            <dt className="mt-[7px] text-[11px] font-medium leading-[1.3] text-ss-nav-meta">
              {label}
            </dt>
            <dd className="font-display text-[26px] font-bold leading-none tabular-nums text-white">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <figure className="mt-6 rounded-panel border border-white/[0.09] bg-white/[0.06] px-[18px] py-4">
        <blockquote className="text-pretty text-[13px] leading-[1.6] text-ss-indigo-100">
          &ldquo;We stopped losing leads overnight. It replies before I&apos;ve
          even seen the notification.&rdquo;
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-2.5">
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ss-indigo font-display text-[10px] font-bold text-white"
            aria-hidden
          >
            F
          </span>
          <span className="text-[11.5px] font-semibold leading-none text-white">
            Franco Salvacion
          </span>
          <span className="text-[11.5px] leading-none text-ss-nav-dim">
            · HighThrive
          </span>
        </figcaption>
      </figure>
    </>
  );
}

function SetupBody() {
  return (
    <>
      <h2 className="text-pretty font-display text-[34px] font-bold leading-[1.2] tracking-[-0.02em] text-white">
        Live on your DMs in about ten minutes.
      </h2>

      <ol className="mt-[30px] flex flex-col">
        {SETUP_STEPS.map(({ title, body }, i) => {
          const last = i === SETUP_STEPS.length - 1;
          return (
            <li key={title} className="flex gap-3.5">
              <div className="flex flex-none flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-xs font-bold ${
                    i === 0
                      ? "bg-ss-indigo text-white"
                      : "border-[1.5px] border-white/[0.28] text-ss-nav-meta"
                  }`}
                >
                  {i + 1}
                </span>
                {!last && <span className="my-1.5 w-0.5 flex-1 bg-white/[0.14]" />}
              </div>
              <div className={last ? "" : "pb-5"}>
                <div className="font-display text-sm font-bold leading-[1.2] text-white">
                  {title}
                </div>
                <div className="mt-1.5 text-[12.5px] leading-[1.5] text-ss-nav-text">
                  {body}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <PlanNote className="mt-6" />
    </>
  );
}

/** The plan callout. States the price plainly - there is no free trial. */
function PlanNote({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-panel border border-[#34d399]/[0.28] bg-[#34d399]/[0.12] px-[17px] py-4 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <CheckCircle2 className="h-[17px] w-[17px] shrink-0 text-ss-mint" aria-hidden />
        <span className="font-display text-[13px] font-bold leading-none text-ss-mint">
          ${PRICING.monthly}/mo when you go live
        </span>
      </div>
      <p className="mt-2 text-xs leading-[1.5] text-ss-mint-text">
        No card to create your account. Unlimited replies on all five channels,
        cancel any time from Billing.
      </p>
    </div>
  );
}

/** Mobile: the navy block above the form, with a rounded bottom edge. */
export function AuthBrandHeader({ variant }: { variant: AuthVariant }) {
  return (
    <div className="relative overflow-hidden rounded-b-[26px] bg-ss-navy px-[22px] pb-6 pt-5 lg:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 right-9 h-[200px] w-1.5 rotate-[24deg] bg-ss-indigo/[0.28]"
      />

      <Link href="/" aria-label="SpeedSettr home" className="relative w-fit">
        <Logo white size="sm" />
      </Link>

      {variant === "proof" ? (
        <>
          <h2 className="relative mt-5 text-pretty font-display text-2xl font-bold leading-[1.25] tracking-[-0.01em] text-white">
            Every DM answered in under a minute.
          </h2>
          <dl className="relative mt-4 flex gap-[18px]">
            {PROOF_STATS.map(({ value, label, short }) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="mt-1.5 text-[10px] font-medium leading-none text-ss-nav-meta">
                  {short}
                </dt>
                <dd className="font-display text-[19px] font-bold leading-none text-white">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <>
          <h2 className="relative mt-5 text-pretty font-display text-[21px] font-bold leading-[1.25] tracking-[-0.01em] text-white">
            Live on your DMs in about ten minutes.
          </h2>
          <PlanNote className="relative mt-4" />
        </>
      )}
    </div>
  );
}
