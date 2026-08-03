"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Instagram, Check } from "lucide-react";

/* ---------------------------------------------------------------------------
   Animated hero phone: a looping DM conversation that cycles through the
   platforms SpeedSettr answers. A lead messages, the AI shows a typing
   indicator, then replies. Bot bubbles stay brand-indigo on every platform so
   the point reads as "this is *our* AI, everywhere".
--------------------------------------------------------------------------- */

type Message = { from: "lead" | "bot"; text: string };

type Platform = {
  id: string;
  name: string;
  handle: string;
  /** Header tint: the platform's own identity */
  header: string;
  ring: string;
  icon: ComponentType<{ className?: string }>;
  lead: { name: string; initials: string; avatar: string };
  messages: Message[];
};

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88a.75.75 0 0 1 .5-.04c.91.25 1.88.38 2.93.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2Z" />
      <path
        d="M5.99 14.53l2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75c.21.16.5.16.71 0l3.16-2.4c.42-.32.97.19.69.64l-2.95 4.65a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.71 0l-3.16 2.4c-.42.32-.97-.18-.68-.63Z"
        fill="#15123a"
      />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.6 2.59 2.59 0 0 1 3.36-2.47V9.7a5.68 5.68 0 0 0-.82-.06A5.7 5.7 0 0 0 4.11 15.3 5.7 5.7 0 0 0 9.81 21a5.7 5.7 0 0 0 5.7-5.7V8.9a7.35 7.35 0 0 0 4.3 1.38V7.19a4.29 4.29 0 0 1-3.21-1.37Z" />
    </svg>
  );
}

const PLATFORMS: Platform[] = [
  {
    id: "messenger",
    name: "Messenger",
    handle: "Coastline Realty Group",
    header: "from-[#0084ff] to-[#a033ff]",
    ring: "ring-[#0084ff]/40",
    icon: MessengerIcon,
    lead: { name: "Ashley M.", initials: "AM", avatar: "from-[#f472b6] to-[#c026d3]" },
    messages: [
      { from: "lead", text: "Hi! Is the 3-bed on Maple still available?" },
      { from: "bot", text: "It is! 🏡 Showings are open Thu–Sat. Want me to grab you a time?" },
      { from: "lead", text: "Saturday morning if possible" },
      { from: "bot", text: "Saturday 10:30AM works 👍 What's the best email for the confirmation?" },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    handle: "jordanlee.coaching",
    header: "from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    ring: "ring-[#ee2a7b]/40",
    icon: Instagram,
    lead: { name: "Marcus T.", initials: "MT", avatar: "from-[#38bdf8] to-[#4f46e5]" },
    messages: [
      { from: "lead", text: "How much is your 1:1 coaching?" },
      { from: "bot", text: "The 12-week program is $2,400, or 3 payments of $850 💸 Want the breakdown?" },
      { from: "lead", text: "yes please" },
      { from: "bot", text: "Sent! 🔗 Book a free 15-min fit call in there and I'll hold your spot." },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    handle: "@coachdanafit",
    header: "from-[#25f4ee] to-[#fe2c55]",
    ring: "ring-[#25f4ee]/40",
    icon: TikTokIcon,
    lead: { name: "Jenna L.", initials: "JL", avatar: "from-[#34d399] to-[#0ea5e9]" },
    messages: [
      { from: "lead", text: "Do you take clients in Texas?" },
      { from: "bot", text: "Yep, coaching's fully online, so any state works 🙌 What's your goal right now?" },
      { from: "lead", text: "drop 20 lbs before June" },
      { from: "bot", text: "Very doable in 12 weeks 💪 Want me to send the plan and pricing?" },
    ],
  },
];

const TYPING_LEAD_IN = 480; // pause before the "typing…" dots appear
const TYPING_HOLD = 1250; // how long the AI "thinks"
const LEAD_HOLD = 950; // gap before the lead's next message
const LOOP_PAUSE = 2600; // rest at the end of a thread before switching

export function DmPhone() {
  const [platformIdx, setPlatformIdx] = useState(0);
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Respect prefers-reduced-motion: render the full thread, no animation loop.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const platform = PLATFORMS[platformIdx];
  const shown = reduced ? platform.messages : platform.messages.slice(0, visible);

  useEffect(() => {
    if (reduced) return;

    const script = platform.messages;

    // Thread finished: hold, then move to the next platform.
    if (visible >= script.length) {
      const t = setTimeout(() => {
        setVisible(0);
        setTyping(false);
        setPlatformIdx((i) => (i + 1) % PLATFORMS.length);
      }, LOOP_PAUSE);
      return () => clearTimeout(t);
    }

    const next = script[visible];

    // Bot messages get a typing indicator before they land.
    if (next.from === "bot" && !typing) {
      const t = setTimeout(() => setTyping(true), TYPING_LEAD_IN);
      return () => clearTimeout(t);
    }

    const t = setTimeout(
      () => {
        setTyping(false);
        setVisible((v) => v + 1);
      },
      next.from === "bot" ? TYPING_HOLD : LEAD_HOLD,
    );
    return () => clearTimeout(t);
  }, [platformIdx, visible, typing, reduced, platform.messages]);

  const Icon = platform.icon;

  return (
    <div className="relative mx-auto w-full max-w-[420px] px-0 sm:px-6">
      {/* Glow behind the device */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 -inset-y-8 rounded-[3rem] bg-[#6366f1]/25 blur-[70px]"
      />

      {/* Floating proof chips, parked just outside the device edges */}
      <div
        className="animate-float absolute left-0 top-28 z-20 hidden rounded-xl border border-white/15 bg-[#1e1b4b]/95 px-3 py-2 shadow-xl backdrop-blur sm:block"
        style={{ animationDelay: "0.8s" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20">
            <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
          </span>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold text-white">Replied in 4s</div>
            <div className="text-[10px] text-white/50">while you were sleeping</div>
          </div>
        </div>
      </div>

      <div className="animate-float absolute -bottom-1 right-0 z-20 hidden rounded-xl border border-white/15 bg-[#1e1b4b]/95 px-3 py-2 shadow-xl backdrop-blur sm:block">
        <div className="text-[11px] font-semibold text-white">Lead captured 🎯</div>
        <div className="text-[10px] text-white/50">added to your inbox</div>
      </div>

      {/* Device */}
      <div className="relative mx-auto w-full max-w-[310px] rounded-[2.6rem] border border-white/15 bg-gradient-to-b from-white/15 to-white/5 p-[3px] shadow-2xl shadow-black/50">
        <div className="relative overflow-hidden rounded-[2.45rem] bg-[#120f30]">
          {/* Notch */}
          <div className="absolute left-1/2 top-2.5 z-30 h-6 w-28 -translate-x-1/2 rounded-full bg-black/80" />

          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-medium text-white/70">
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-[2px] bg-white/60" />
              <span className="h-2.5 w-2.5 rounded-full border border-white/50" />
              <span className="h-2 w-4 rounded-[2px] border border-white/50" />
            </span>
          </div>

          {/* Chat header, re-keyed so it re-animates on platform switch */}
          <div
            key={`${platform.id}-head`}
            className="animate-pop flex items-center gap-3 border-b border-white/10 px-4 pb-3 pt-2"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${platform.header} ring-2 ${platform.ring}`}
            >
              <Icon className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                {platform.handle}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {platform.name} · AI active
              </div>
            </div>
          </div>

          {/* Messages, anchored bottom so the thread grows upward */}
          <div className="flex h-[336px] flex-col justify-end gap-2.5 px-4 pb-3">
            {shown.map((m, i) =>
              m.from === "lead" ? (
                <div key={`${platform.id}-${i}`} className="animate-pop flex items-end gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${platform.lead.avatar} text-[9px] font-bold text-white`}
                  >
                    {platform.lead.initials}
                  </div>
                  <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-[13px] leading-snug text-white/90">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={`${platform.id}-${i}`} className="animate-pop flex flex-col items-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#6366f1] px-3.5 py-2 text-[13px] leading-snug text-white shadow-lg shadow-[#6366f1]/25">
                    {m.text}
                  </div>
                  <div className="mt-1 flex items-center gap-1 pr-1 text-[10px] text-white/40">
                    <span className="h-1 w-1 rounded-full bg-[#a5b4fc]" />
                    SpeedSettr AI
                  </div>
                </div>
              ),
            )}

            {typing && (
              <div className="animate-pop flex justify-end">
                <div className="flex items-center gap-1 rounded-2xl rounded-br-md bg-[#6366f1]/80 px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="animate-dot h-1.5 w-1.5 rounded-full bg-white"
                      style={{ animationDelay: `${d * 0.16}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
            <div className="flex-1 rounded-full bg-white/[0.07] px-4 py-2 text-[12px] text-white/35">
              Message…
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/40">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.39 1l1.49 5.86L14 12l-10.5 1.54-1.49 5.86a1 1 0 0 0 1.39 1Z" />
              </svg>
            </div>
          </div>

          {/* Home indicator */}
          <div className="mx-auto mb-2 h-1 w-28 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Platform progress dots */}
      <div className="mt-12 flex items-center justify-center gap-2">
        {PLATFORMS.map((p, i) => (
          <span
            key={p.id}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === platformIdx ? "w-6 bg-[#a5b4fc]" : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
