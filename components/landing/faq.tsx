import { Minus, Plus } from "lucide-react";

/**
 * The pre-purchase objections, answered.
 *
 * Built on <details>/<summary> rather than a state-driven accordion: it needs no
 * JavaScript, it's keyboard- and screen-reader-correct for free, and - the part
 * that matters for a marketing page - the answers are in the HTML whether or not
 * they're open, so search engines and link previews can read them.
 *
 * Every answer below describes behaviour the product actually has. If a claim
 * here stops being true, this file is the thing to fix.
 */

const FAQS: { q: string; a: string[]; open?: boolean }[] = [
  {
    q: "Will it sound like a robot?",
    open: true,
    a: [
      "No - and that's the whole point. It runs on a frontier language model, it waits a few seconds before replying instead of firing back instantly, it groups rapid-fire messages into one answer the way a person would, and it writes in the tone you picked.",
      "Read the transcripts yourself in the inbox and judge for yourself.",
    ],
  },
  {
    q: "What if it says the wrong thing?",
    a: [
      "It answers from the knowledge base you write, not from guesses. When a lead asks something you never covered, it says it will check rather than inventing an answer.",
      "You can also write rules for what it must never claim. The AI treats your knowledge base as the boundary of what it's allowed to assert, so an unwritten rule is the only kind it can break. The Knowledge base screen shows a coverage meter so you can see when your entries are still thin.",
    ],
  },
  {
    q: "Can I jump into a conversation myself?",
    a: [
      "Any time on Instagram, Facebook, WhatsApp and Telegram - open the thread, pause the AI, and reply as yourself. The lead sees one continuous conversation, not a handoff. TikTok is receive-and-reply-only through ManyChat, so those threads are read-only in the inbox.",
      "Switch the AI back on when you're done and it picks up with the full history, including everything you just said.",
    ],
  },
  {
    q: "Do I need ManyChat, and does it cost extra?",
    a: [
      "Yes, ManyChat is how DMs reach us and how replies go back out, and it's billed separately by ManyChat - we don't resell it or mark it up.",
      "Connecting it is one automation per channel: paste your webhook URL and secret into a ManyChat External Request, set the channel name, done. The setup guide in your dashboard walks through it, including the one automation people always forget.",
    ],
  },
  {
    q: "What happens if a lead goes quiet for a day?",
    a: [
      "Follow-up sequences. You write the steps and we send them on your schedule. A reply resets the clock rather than ending the sequence, so the lead keeps their place and the next step only goes out after the next stretch of silence. Mark the thread subscribed, or tag it, to stop it for good.",
      "Timing matters more than people expect: Instagram and Facebook close their messaging window 24 hours after the lead's last message. The app tracks that window on every conversation and shows you which threads are about to close while you can still reach them.",
    ],
  },
  {
    q: "Is my customer data safe?",
    a: [
      "Your conversations sit behind row-level security, so every read is scoped to your account and no other customer's bot can reach them. Payments run through Stripe - a card number never touches our servers.",
      "You can delete knowledge entries and uploaded assets yourself at any time. To have a conversation or an entire chatbot removed, email admin@speedsettr.com and we'll action it.",
    ],
  },
];

export function Faq() {
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#120f30]">
      {FAQS.map(({ q, a, open }, i) => (
        <details
          key={q}
          open={open}
          className={`group px-5 py-5 sm:px-6 ${
            i < FAQS.length - 1 ? "border-b border-white/[0.07]" : ""
          }`}
        >
          <summary className="flex cursor-pointer list-none items-center gap-3.5 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-base font-semibold leading-[1.3] text-white group-open:font-bold sm:text-[17px]">
              {q}
            </span>
            <span className="ml-auto shrink-0" aria-hidden>
              <Plus className="h-5 w-5 text-[#8b88b8] group-open:hidden" />
              <Minus className="hidden h-5 w-5 text-[#c084fc] group-open:block" />
            </span>
          </summary>
          <div className="max-w-[620px] pt-3">
            {a.map((p, j) => (
              <p
                key={j}
                className={`text-pretty text-sm leading-[1.7] text-[#b6b4dd] ${
                  j > 0 ? "mt-3" : ""
                }`}
              >
                {p}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
