import {
  AlertCircle,
  BookOpen,
  FileText,
  HelpCircle,
  Sparkles,
} from "lucide-react";

/**
 * The three product illustrations on the marketing page - a real reply, the
 * knowledge base, and the "needs attention" queue.
 *
 * These are static pictures of the product, not live components: everything
 * here is a screenshot rendered in markup so it stays crisp, themable and
 * indexable. Each one mirrors a screen that actually exists in the app, so the
 * page never promises a view the dashboard doesn't have.
 */

/** The soft gradient plate every mock sits on. */
function Plate({
  children,
  flip = false,
}: {
  children: React.ReactNode;
  /** Mirror the gradient so alternating rows don't look copy-pasted. */
  flip?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-[22px] border border-[#e4e0f7] p-4 sm:p-[26px] ${
        flip
          ? "bg-[linear-gradient(140deg,#eef0ff,#f6f4ff)]"
          : "bg-[linear-gradient(140deg,#f6f4ff,#eef0ff)]"
      }`}
    >
      {children}
    </div>
  );
}

/** 01 - two rapid-fire questions answered as one message. */
export function ReplyMock() {
  return (
    <Plate>
      <div className="overflow-hidden rounded-card border border-[#eceaf7] bg-white shadow-[0_18px_40px_-26px_rgba(30,27,75,.4)]">
        <div className="flex items-center gap-2.5 border-b border-[#f3f2fa] px-4 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f4ebff] font-display text-[11px] font-bold text-[#7c22c4]">
            B
          </span>
          <div>
            <div className="text-[12.5px] font-semibold leading-none text-ss-navy">
              Bernardo
            </div>
            <div className="mt-1 text-[10.5px] leading-none text-[#8b8ea8]">
              Facebook · 9:07 PM
            </div>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[#e8f8f1] px-2 py-[3px] text-[9.5px] font-bold leading-[1.6] text-[#046c4e]">
            <span className="h-[5px] w-[5px] rounded-full bg-[#059669]" />
            AI ACTIVE
          </span>
        </div>

        <div className="flex flex-col gap-2.5 p-4">
          {[
            "hey saw your post about the remote closers",
            "whats the price for the done for you one",
          ].map((t) => (
            <div
              key={t}
              className="max-w-[78%] self-start rounded-[14px] rounded-bl-[4px] bg-[#f6f7fc] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-ss-navy"
            >
              {t}
            </div>
          ))}

          <div className="flex max-w-[86%] flex-col items-end self-end">
            <div className="rounded-[14px] rounded-br-[4px] bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-white">
              Both questions in one - done-for-you starts at $997/mo and we place
              a vetted closer in about 10 days. Want me to hold a call slot this
              week?
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-[#7c22c4]" aria-hidden />
              <span className="text-[10.5px] font-medium leading-none text-[#a3a5bd]">
                Sent by AI · 41s later · 2 messages grouped
              </span>
            </div>
          </div>
        </div>
      </div>
    </Plate>
  );
}

const KB_FILES = [
  { name: "Pricing & packages", kind: "PDF" },
  { name: "Refund policy", kind: "typed" },
  { name: "How placement works", kind: "DOCX" },
];

/** 02 - the knowledge base, including the gap it found on its own. */
export function KnowledgeMock() {
  return (
    <Plate flip>
      <div className="rounded-card border border-[#eceaf7] bg-white p-[18px] shadow-[0_18px_40px_-26px_rgba(30,27,75,.4)]">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-[18px] w-[18px] text-[#7c22c4]" aria-hidden />
          <span className="font-display text-[13.5px] font-bold leading-none text-ss-navy">
            Knowledge base
          </span>
          <span className="ml-auto rounded-full bg-[#e8f8f1] px-2.5 py-[3px] text-[9.5px] font-bold leading-[1.6] text-[#046c4e]">
            INDEXED
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {KB_FILES.map(({ name, kind }) => (
            <div
              key={name}
              className="flex items-center gap-2.5 rounded-ctl-lg border border-[#f0eefa] px-3.5 py-3"
            >
              <FileText className="h-4 w-4 shrink-0 text-[#8b8ea8]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-none text-ss-navy">
                {name}
              </span>
              <span className="text-[11px] leading-none text-[#a3a5bd]">
                {kind}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-chip border border-dashed border-[#d9cdf2] bg-[#faf7ff] p-3.5">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-[#7c22c4]" aria-hidden />
            <span className="text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] text-[#6b21a8]">
              It tells you what it&apos;s missing
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-[1.5] text-[#5c5f80]">
            &ldquo;do you refund if it doesn&apos;t work?&rdquo; - asked 4× and
            unanswered. Add it in one click.
          </p>
        </div>
      </div>
    </Plate>
  );
}

const WAITING = [
  {
    initial: "B",
    name: "Bernardo",
    reason: "asked for a call · 23m",
    reasonClass: "text-[#e11d48]",
    quote: "“can we talk today?”",
    primary: true,
  },
  {
    initial: "M",
    name: "Mildred",
    reason: "payment question · 2h",
    reasonClass: "text-[#92400e]",
    quote: "“i sent the deposit already”",
    primary: false,
  },
];

/** 03 - the queue the AI hands back to you. */
export function TakeoverMock() {
  return (
    <Plate>
      <div className="overflow-hidden rounded-card border border-[#eceaf7] bg-white shadow-[0_18px_40px_-26px_rgba(30,27,75,.4)]">
        <div className="flex items-center gap-2.5 border-b border-[#f3f2fa] px-4 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-ctl bg-[#ffe9ee]">
            <AlertCircle className="h-4 w-4 text-[#e11d48]" aria-hidden />
          </span>
          <div>
            <div className="font-display text-[13.5px] font-bold leading-none text-ss-navy">
              Needs attention
            </div>
            <div className="mt-1 text-[10.5px] leading-none text-[#8b8ea8]">
              The AI stepped back - close these yourself
            </div>
          </div>
          <span className="ml-auto rounded-full bg-[#e11d48] px-2.5 py-[3px] font-display text-[10px] font-bold leading-[1.5] text-white">
            {WAITING.length}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 px-3 pb-3.5 pt-2.5">
          {WAITING.map((w) => (
            <div
              key={w.name}
              className="flex items-center gap-2.5 rounded-chip border border-[#f2f1fa] bg-[#fbfbfe] p-2.5"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#f4ebff] font-display text-[11px] font-bold text-[#7c22c4]">
                {w.initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5">
                  <span className="text-[12.5px] font-semibold leading-none text-ss-navy">
                    {w.name}
                  </span>
                  <span
                    className={`text-[10.5px] font-medium leading-none ${w.reasonClass}`}
                  >
                    {w.reason}
                  </span>
                </div>
                <div className="mt-1.5 truncate text-[11.5px] leading-none text-[#8b8ea8]">
                  {w.quote}
                </div>
              </div>
              <span
                className={
                  w.primary
                    ? "shrink-0 rounded-ctl bg-[linear-gradient(120deg,#7c22c4,#5355cb)] px-2.5 py-2 text-[11.5px] font-semibold leading-none text-white"
                    : "shrink-0 rounded-ctl border border-ss-line px-2.5 py-2 text-[11.5px] font-semibold leading-none text-ss-navy"
                }
              >
                Take over
              </span>
            </div>
          ))}
        </div>
      </div>
    </Plate>
  );
}
