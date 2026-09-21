/**
 * The pre-booking objections, answered (HighThrive.ai funnel).
 *
 * Built on <details>/<summary>, not a state-driven accordion: no JavaScript, it's
 * keyboard- and screen-reader-correct for free, and - the part that matters for a
 * marketing page - the answers are in the HTML whether or not they're open, so
 * search engines and link previews (and the FAQPage JSON-LD in
 * components/seo/structured-data.tsx, which imports FAQS) can read them.
 *
 * Every answer describes behaviour the product actually has. If a claim here
 * stops being true, this file is the thing to fix. `a` stays string[] so the
 * JSON-LD builder can join paragraphs; single-paragraph answers are one entry.
 */

// Exported so components/seo/structured-data.tsx builds the FAQPage JSON-LD from
// the exact same Q/A pairs the accordion renders (single source of truth).
export const FAQS: { q: string; a: string[]; open?: boolean }[] = [
  {
    q: "Will it sound like a robot?",
    open: true,
    a: [
      "It waits a few seconds instead of firing back instantly, answers three quick messages in one reply the way a person would, and writes in the tone you set during setup. The transcripts are all in your inbox, so judge it yourself after a day.",
    ],
  },
  {
    q: "What if it says the wrong thing?",
    a: [
      "It only answers from the material you gave it. Anything outside that gets handed to you rather than guessed at, and a correction you make once carries forward.",
    ],
  },
  {
    q: "Can I jump into a conversation myself?",
    a: [
      "Any time. Hit take over and the AI steps back for that chat; resume it when you're done. Every channel lands in the same inbox.",
    ],
  },
  {
    q: "Do I need ManyChat, and does it cost extra?",
    a: [
      "Yes. One ManyChat account covers all five channels, billed by them rather than us, and we wire it up with you on the call.",
    ],
  },
  {
    q: "What happens if a lead goes quiet for a day?",
    a: [
      "It follows up on your schedule, in your voice, and stops when they reply or when you tell it to.",
    ],
  },
  {
    q: "How long until it pays for itself?",
    a: [
      "Most accounts book their first call off an AI-answered DM inside the first week. One closed client a month covers the plan, and after that it's revenue that was already sitting unanswered.",
    ],
  },
  {
    q: "What if it isn't a fit for my business?",
    a: [
      "We'll say so on the call. Low DM volume, or a business where every question needs judgment, and you'll get a no rather than a pitch.",
    ],
  },
  {
    q: "Is my customer data safe?",
    a: [
      "Encrypted in transit and at rest, never used to train public models, and deletable on request. Payments run through Stripe.",
    ],
  },
];

export function Faq() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#F4F1EA]/10 bg-[#111216]">
      {FAQS.map(({ q, a, open }, i) => (
        <details
          key={q}
          open={open}
          className={`group ${
            i < FAQS.length - 1 ? "border-b border-[#F4F1EA]/[0.08]" : ""
          }`}
        >
          <summary className="flex cursor-pointer list-none items-center gap-4 px-[22px] py-5 text-[15.5px] font-medium leading-tight tracking-[-0.01em] text-[#F4F1EA] transition-colors hover:bg-[#15161B] [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{q}</span>
            <span className="text-lg leading-none text-[#E8B644]" aria-hidden>
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">&minus;</span>
            </span>
          </summary>
          <div className="max-w-[46em] px-[22px] pb-[22px] text-[14.5px] leading-[1.6] text-[#A9A499]">
            {a.map((p, j) => (
              <p key={j} className={j > 0 ? "mt-3" : ""}>
                {p}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
