"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Objection handling, in the order the objections actually arrive.
 *
 * Every answer ends pointing at the call rather than at a feature. The FAQ is
 * the last thing between a warm visitor and the form; its job is to remove
 * the specific reason they are hesitating, not to document the product.
 */
const ITEMS = [
  {
    q: "Will it sound like a bot?",
    a: "That is the thing we get judged on, so it is the thing we tuned hardest. It writes in your voice, waits a human beat before replying, and groups three rapid-fire messages into one answer instead of three. On the call we will open your real DMs and draft replies live — you will know inside five minutes whether it passes.",
  },
  {
    q: "What if it says something wrong about pricing?",
    a: "It only answers from what you have given it. Asked something you never covered, it flags the gap and hands the chat to you rather than inventing a number. You correct it once and it holds the correction from then on.",
  },
  {
    q: "Do I have to change how I work?",
    a: "No. It sits on the Instagram, Messenger, WhatsApp, Telegram and TikTok accounts you already have. Nothing moves, nothing is migrated, and you keep answering anyone you want to answer yourself — the moment you type, it steps back.",
  },
  {
    q: "How long until it is actually running?",
    a: "Most accounts are live the same week. The work is one session teaching it your offers and your objections, and we do that with you rather than handing you a blank text box.",
  },
  {
    q: "Is the call a disguised sales pitch?",
    a: "It is twenty minutes, and it is us looking at your inbox. If your volume is too low to justify this, we will tell you on the call — sending someone away is cheaper for us than a refund three weeks later.",
  },
];

export function Faq() {
  // One open at a time. Multiple open panels turn the section into a wall of
  // text and lose the scan-ability that made it an accordion in the first place.
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className="divide-y divide-au-line-soft border-y border-au-line-soft">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-trigger-${i}`}
                className="au-press flex w-full items-start gap-4 py-5 text-left"
              >
                <span className="au-title-3 flex-1 text-au-ink">{item.q}</span>
                <span
                  className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-au-line bg-au-surface transition-transform duration-300 ease-au-spring",
                    isOpen && "rotate-45 border-au-gold bg-au-gold"
                  )}
                  aria-hidden="true"
                >
                  <Plus className="h-4 w-4 text-au-ink" />
                </span>
              </button>
            </h3>

            {/* Height animates via grid-template-rows, which unlike max-height
                interpolates to the content's REAL height - so a long answer
                never snaps open early or leaves dead space under a short one. */}
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-au-spring",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <p className="au-body max-w-[46rem] pb-6 pr-10 text-au-ink-2">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
