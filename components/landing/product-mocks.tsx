import { AlertCircle, FileText, HelpCircle, Sparkles } from "lucide-react";

/**
 * The three product illustrations inside the dark product cards - a real reply,
 * the knowledge base with its coverage meter, and the queue it hands back.
 *
 * Static pictures of the product rendered in markup, not live components, so
 * they stay crisp and indexable. Each mirrors a screen that actually exists in
 * the app, so the page never promises a view the dashboard doesn't have.
 *
 * The names and timings inside are illustrative, the way any product
 * screenshot is - they depict one conversation, they don't claim an average.
 */

/** The translucent surface each mock sits on inside its card. */
function Inner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-panel border border-white/[0.08] bg-white/[0.04] p-3.5">
      {children}
    </div>
  );
}

/** 01 - two rapid-fire questions answered as one message. */
export function ReplyMock() {
  return (
    <Inner>
      <div className="flex flex-col gap-2.5">
        <div className="max-w-[92%] self-start rounded-[13px] rounded-bl-[4px] bg-[#2a2745] px-3 py-2.5 text-xs leading-[1.5] text-white">
          whats the price for the done for you one
        </div>
        <div className="max-w-[95%] self-end">
          <div className="rounded-[13px] rounded-br-[4px] bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-3 py-2.5 text-xs leading-[1.5] text-white">
            Done-for-you starts at $997/mo and we place a vetted closer in about
            10 days. Want me to hold a call slot this week?
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <Sparkles className="h-[11px] w-[11px] text-[#c084fc]" aria-hidden />
            <span className="text-[10px] font-medium leading-none text-[#8b88b8]">
              AI · 41s later
            </span>
          </div>
        </div>
      </div>
    </Inner>
  );
}

const KB_FILES = [
  { name: "Pricing & packages", kind: "PDF" },
  { name: "Refund policy", kind: "typed" },
];

/** 02 - the knowledge base and how thin its coverage currently is. */
export function KnowledgeMock() {
  return (
    <Inner>
      <div className="flex flex-col gap-[7px]">
        {KB_FILES.map(({ name, kind }) => (
          <div
            key={name}
            className="flex items-center gap-2.5 rounded-ctl-lg bg-white/[0.04] px-3 py-2.5"
          >
            <FileText className="h-[15px] w-[15px] shrink-0 text-[#8b88b8]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none text-white">
              {name}
            </span>
            <span className="text-[10.5px] leading-none text-[#8b88b8]">{kind}</span>
          </div>
        ))}
      </div>

      {/* The real Knowledge base screen shows a coverage meter (Empty / Thin /
          Good against HEALTHY_ENTRIES), not per-question gap detection. The
          design's "asked 4x, unanswered" panel described a feature that does
          not exist, so this depicts the meter that does. */}
      <div className="mt-3 rounded-ctl-lg border border-dashed border-[#fbbf24]/30 bg-[#d97706]/10 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="h-[13px] w-[13px] text-[#fbbf24]" aria-hidden />
          <span className="text-[9.5px] font-bold uppercase leading-none tracking-[0.06em] text-[#fbbf24]">
            Coverage · thin
          </span>
        </div>
        <p className="mt-[7px] text-[11.5px] leading-[1.5] text-[#d9c7a3]">
          2 entries. Add the questions you lose deals over.
        </p>
      </div>
    </Inner>
  );
}

const WAITING = [
  {
    initial: "B",
    name: "Bernardo",
    reason: "asked for a call · 23m",
    reasonClass: "text-[#fca5b5]",
    primary: true,
  },
  {
    initial: "M",
    name: "Mildred",
    reason: "payment question · 2h",
    reasonClass: "text-[#fbbf24]",
    primary: false,
  },
];

/** 03 - the queue the AI hands back to you. */
export function TakeoverMock() {
  return (
    <Inner>
      <div className="flex items-center gap-2.5">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-ctl bg-[#e11d48]/[0.18]">
          <AlertCircle className="h-[15px] w-[15px] text-[#fca5b5]" aria-hidden />
        </span>
        <span className="font-display text-[12.5px] font-bold leading-none text-white">
          Needs attention
        </span>
        <span className="ml-auto rounded-full bg-[#e11d48] px-2 py-[3px] font-display text-[10px] font-bold leading-[1.5] text-white">
          {WAITING.length}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-[7px]">
        {WAITING.map((w) => (
          <div
            key={w.name}
            className="flex items-center gap-2.5 rounded-ctl-lg bg-white/[0.04] p-2.5"
          >
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#7c22c4]/[0.24] font-display text-[10px] font-bold text-[#c084fc]">
              {w.initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold leading-none text-white">
                {w.name}
              </div>
              <div
                className={`mt-1.5 truncate text-[10.5px] leading-none ${w.reasonClass}`}
              >
                {w.reason}
              </div>
            </div>
            <span
              className={
                w.primary
                  ? "shrink-0 rounded-ctl bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-white"
                  : "shrink-0 rounded-ctl border border-white/[0.16] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-white"
              }
            >
              Take over
            </span>
          </div>
        ))}
      </div>
    </Inner>
  );
}
