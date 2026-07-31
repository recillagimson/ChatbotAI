/**
 * The Learn library.
 *
 * The design's rule for this screen is that every lesson names the number it
 * moves. So a lesson isn't just a title and a duration - it carries a `signal`
 * that reads the workspace's actual state and returns the reason this person
 * should watch it now ("fixes your 181 failed sends"), or null if it isn't
 * relevant to them yet. `recommendedPath` sorts by that.
 *
 * Content lives here rather than in a table: these are product lessons, they
 * change when the product changes, and shipping them as code means they're
 * reviewed alongside the behaviour they describe.
 */

export type LearnCategory =
  | "Setup"
  | "Writing & tone"
  | "Conversations"
  | "Reading your stats"
  | "Troubleshooting";

export const LEARN_CATEGORIES: LearnCategory[] = [
  "Setup",
  "Writing & tone",
  "Conversations",
  "Reading your stats",
  "Troubleshooting",
];

/** What the library knows about a workspace when it decides what to suggest. */
export interface LearnSignals {
  kbEntries: number;
  deliveryFailures: number;
  manualFollowups: number;
  needsAttention: number;
  hasKeywords: boolean;
  followupsOn: boolean;
  connected: boolean;
  chatbots: number;
}

export interface Lesson {
  slug: string;
  title: string;
  category: LearnCategory;
  /** Minutes to read. */
  minutes: number;
  summary: string;
  /** Gradient pair for the card thumbnail. */
  gradient: [string, string];
  /**
   * Why this matters to THIS workspace right now, or null when it doesn't.
   * A non-null return also puts the lesson in the recommended path.
   */
  signal: (s: LearnSignals) => string | null;
  body: { heading: string; paragraphs: string[] }[];
}

export const LESSONS: Lesson[] = [
  {
    slug: "connect-manychat",
    title: "Connect ManyChat the right way",
    category: "Setup",
    minutes: 3,
    summary:
      "One flow per channel, the right platform value in each, and the check that tells you it worked.",
    gradient: ["#312e81", "#4f46e5"],
    signal: (s) =>
      !s.connected ? "Your bot isn't delivering replies yet" : null,
    body: [
      {
        heading: "One flow per channel",
        paragraphs: [
          "SpeedSettr receives DMs from ManyChat and sends replies back through it. That connection is a single External Request action inside a ManyChat automation, and you need one per channel - Instagram, Facebook, WhatsApp, Telegram, TikTok - because each channel has its own subscriber fields.",
          "Copy the webhook URL and the per-chatbot secret from the chatbot's Connection tab. The secret is what proves the request came from your ManyChat account, so treat it like a password and never reuse one bot's secret in another bot's flow.",
        ],
      },
      {
        heading: "Set the platform value in every flow",
        paragraphs: [
          'The JSON body carries a "platform" field. Set it to the channel that flow actually runs on: instagram, messenger (that\'s Facebook), whatsapp, telegram or tiktok. Getting this wrong is the most common setup mistake, and it is quiet - replies still generate, they just try to deliver on the wrong channel.',
          "Use that channel's own username variable too. On Instagram it's the Instagram username merge field, not the generic one, or every contact arrives with an unresolved placeholder for a name.",
        ],
      },
      {
        heading: "The one automation people forget",
        paragraphs: [
          'ManyChat\'s AI "any message" trigger silently skips some buying-intent questions. The catch-all that actually fires on everything is the Default Reply automation, set to run every time. If replies work in testing but real leads get nothing, that automation is almost always the reason.',
          "Once it's wired, send yourself a DM from a second account. ManyChat's own test tool does not open a real messaging window, so a test contact never receives a reply - it has to be a real conversation.",
        ],
      },
    ],
  },
  {
    slug: "knowledge-entries-that-land",
    title: "Write knowledge entries the bot actually uses",
    category: "Writing & tone",
    minutes: 4,
    summary:
      "How one well-written entry stops a whole category of off-script replies.",
    gradient: ["#6366f1", "#a5b4fc"],
    signal: (s) =>
      s.kbEntries < 6
        ? s.kbEntries === 0
          ? "You have no knowledge entries - the bot is guessing"
          : `You have ${s.kbEntries} ${s.kbEntries === 1 ? "entry" : "entries"} - thin`
        : null,
    body: [
      {
        heading: "One entry, one idea",
        paragraphs: [
          "A knowledge entry is a chunk of information the AI is allowed to state as fact: a price list, a refund policy, a timeline, an FAQ answer. The retrieval that feeds your bot works best when each entry covers one idea, because it pulls the entries closest to what the lead asked - and a single sprawling document matches everything and answers nothing.",
          "Write it the way you'd explain it to a new hire on their first day. Full sentences, no shorthand, no internal codenames the bot will repeat back to a stranger.",
        ],
      },
      {
        heading: "Start with the questions you already lose",
        paragraphs: [
          "The fastest six entries to write are the six questions your leads ask before they buy: what it costs, what's included, how fast someone starts, what happens if it doesn't work, who it isn't for, and how to pay.",
          "Bots with six or more entries go off-script roughly a third as often as bots with one. That's the single highest-leverage hour you can spend in this product.",
        ],
      },
      {
        heading: "Say what NOT to say",
        paragraphs: [
          "Entries can be negative as well as positive. If there's a claim you must never make - a guarantee you don't offer, a timeline you can't promise - write that down explicitly. The AI treats your knowledge base as the boundary of what it's allowed to assert, so an unwritten rule is an unenforced one.",
        ],
      },
    ],
  },
  {
    slug: "beat-the-24-hour-window",
    title: "Beat the 24-hour window",
    category: "Troubleshooting",
    minutes: 4,
    summary:
      "Why sends bounce after a day of silence, and the three ways to reach the lead anyway.",
    gradient: ["#312e81", "#4f46e5"],
    signal: (s) =>
      s.deliveryFailures > 0
        ? `Fixes your ${s.deliveryFailures.toLocaleString()} failed send${s.deliveryFailures === 1 ? "" : "s"}`
        : s.manualFollowups > 0
          ? `${s.manualFollowups} thread${s.manualFollowups === 1 ? " is" : "s are"} past the window`
          : null,
    body: [
      {
        heading: "What the window is",
        paragraphs: [
          "Instagram and Facebook only accept an untagged message within 24 hours of the contact's last message. Past that line, an automated send doesn't get queued or delayed - it's refused. That refusal is where almost every 'failed send' number in your statistics comes from.",
          "It isn't a SpeedSettr limit and there's no setting that removes it. It's a platform rule designed to stop businesses cold-messaging people who've gone quiet.",
        ],
      },
      {
        heading: "Three ways through it",
        paragraphs: [
          "First: don't cross it. Turn on a follow-up sequence with steps inside the window - a nudge at three hours and another at twenty beats one at forty-eight, because the second one never arrives.",
          "Second: reply as a human. A message you send yourself from the Follow-ups screen or the inbox carries the human-agent tag, which extends your reach to seven days. That's why 'Send as me' works on a thread the bot has already given up on.",
          "Third: past seven days there is no third way. Nothing SpeedSettr sends will arrive, so those threads leave the Follow-ups queue - you'll see them counted above it, but not listed as work. If you still want that person, it's a cold approach from your own account, not a reply.",
        ],
      },
      {
        heading: "Read the queue, not the failure count",
        paragraphs: [
          "The failure number tells you the window closed. The Follow-ups queue tells you who's on the other side of it, sorted by how long they've been waiting. Work that queue oldest-first and the failure number takes care of itself.",
        ],
      },
    ],
  },
  {
    slug: "turn-on-follow-ups",
    title: "Turn on follow-up sequences",
    category: "Conversations",
    minutes: 3,
    summary:
      "The timed nudges that catch leads who go quiet - before the window shuts on them.",
    gradient: ["#4f46e5", "#8b8ef5"],
    signal: (s) =>
      !s.followupsOn ? "Follow-ups are off - quiet leads go un-nudged" : null,
    body: [
      {
        heading: "Why hour-scale, not day-scale",
        paragraphs: [
          "A follow-up sequence sends a message some hours after the contact goes quiet. The delays are capped at 22 hours for a reason: the whole sequence has to fit inside one 24-hour messaging window, or the later steps bounce.",
          "A sensible first sequence is two steps - one around three hours, one around eighteen. That catches both the lead who got distracted and the lead who went to bed.",
        ],
      },
      {
        heading: "What to actually say",
        paragraphs: [
          "The step that performs best isn't a reminder, it's a smaller ask. 'Still want me to hold a spot this week, or should I check back next month?' gives the lead an easy way to say no, which is what makes them answer at all.",
          "You can attach an image, voice note or link to a step. Voice and video only push on Messenger and Telegram - on Instagram the step falls back to its text caption, so always write one.",
        ],
      },
      {
        heading: "When it stops",
        paragraphs: [
          "The sequence stops on its own when the lead replies, when you mark them subscribed, when they mute the bot, or when the messaging window closes. You never have to remember to turn it off for a lead who converted.",
        ],
      },
    ],
  },
  {
    slug: "keyword-triggers",
    title: "Use keyword triggers to shortcut the pitch",
    category: "Conversations",
    minutes: 3,
    summary:
      "The fastest path from DM to link, and the mistake that makes a bot repeat itself.",
    gradient: ["#4f46e5", "#8b8ef5"],
    signal: (s) =>
      !s.hasKeywords ? "No keywords set - leads take the long route" : null,
    body: [
      {
        heading: "One keyword, one instant answer",
        paragraphs: [
          "A keyword trigger fires a specific reply the first time a lead's message contains a word you've chosen - the code from your ad, the name of an offer, a phrase like 'got denied'. It skips the discovery back-and-forth and hands them the thing they came for.",
          "Threads that hit a keyword reach the offer link far more often than threads that don't, because the lead gets what they asked for on turn one instead of turn five.",
        ],
      },
      {
        heading: "First time only - and why",
        paragraphs: [
          "The canned reply fires once per contact. If they say the keyword again later, the AI picks up naturally instead of re-pitching. A bot that repeats its opener at someone who's already heard it reads as broken, and it's the fastest way to lose a lead who was still interested.",
        ],
      },
      {
        heading: "Don't gate too hard",
        paragraphs: [
          "The keyword gate can hold the AI back until a lead says one of your words. That keeps costs down on spam-heavy accounts, but it also silences the bot for a real person who phrased things their own way. If you turn the gate on, leave 'answer genuine questions' on with it.",
        ],
      },
    ],
  },
  {
    slug: "take-over-a-chat",
    title: "Take over a chat without confusing the lead",
    category: "Conversations",
    minutes: 3,
    summary:
      "When to step in, what pausing actually does, and how to hand it back.",
    gradient: ["#6366f1", "#a5b4fc"],
    signal: (s) =>
      s.needsAttention > 0
        ? `${s.needsAttention} thread${s.needsAttention === 1 ? " is" : "s are"} waiting for you`
        : null,
    body: [
      {
        heading: "What 'needs attention' means",
        paragraphs: [
          "The AI tags a thread 'needs attention' when it decides a human should close it - someone asked for a call, asked something your knowledge base can't answer, or raised money. That tag is the one state in this product that costs you something when you ignore it, which is why it has its own filter and its own card on the home screen.",
        ],
      },
      {
        heading: "Pausing is per-thread",
        paragraphs: [
          "'Pause AI & take over' stops automatic replies on that one conversation only. Every other thread keeps running. The composer unlocks the moment you pause, because a manual message and an automated one arriving together is the one thing you never want.",
          "'Draft AI reply' writes a suggestion in your bot's voice and drops it in the box for you to edit. It sends nothing - only Send does.",
        ],
      },
      {
        heading: "Handing it back",
        paragraphs: [
          "Press Resume AI when you're done and the bot picks the thread back up with full memory of what you said, because your replies are part of the same transcript it reads. There's no re-briefing step.",
        ],
      },
    ],
  },
  {
    slug: "reading-your-funnel",
    title: "Read your flow drop-offs",
    category: "Reading your stats",
    minutes: 4,
    summary:
      "Find the one stage losing you the most leads - and what to change first.",
    gradient: ["#4f46e5", "#8b8ef5"],
    signal: () => null,
    body: [
      {
        heading: "Three stages, one question",
        paragraphs: [
          "The funnel counts threads that started, threads the bot replied to, and threads where a link went out. The gap that matters is almost never the first one - bots reply to nearly everything. It's the gap between 'replied' and 'link sent'.",
          "That gap is the count of people who talked to your bot and never got an offer. It's usually the largest number on the page and the only one worth working on this week.",
        ],
      },
      {
        heading: "What actually moves it",
        paragraphs: [
          "Two changes move that number more than anything else. A keyword trigger for the word people actually use when they're ready - 'price', 'cost', 'how much' - so the link goes out on turn one. And a knowledge entry that answers the pricing question directly, so the AI stops deflecting it.",
        ],
      },
      {
        heading: "Read the response time next to it",
        paragraphs: [
          "Median first response is the other number to watch. Leads answered inside a minute convert far better than leads answered in ten, and if that median is climbing it usually means delivery is failing rather than that the AI got slower.",
        ],
      },
    ],
  },
  {
    slug: "tags-and-quality",
    title: "What counts as a lead versus bot or spam",
    category: "Reading your stats",
    minutes: 3,
    summary:
      "How threads get tagged, which tags stick, and when to override one by hand.",
    gradient: ["#312e81", "#4f46e5"],
    signal: () => null,
    body: [
      {
        heading: "The tags",
        paragraphs: [
          "Every thread carries one tag: lead, wants a call, starting later, needs attention, subscribed, disqualified, or bot/spam. The AI sets it each turn from what was actually said, and it's what every count on your dashboard is grouped by.",
        ],
      },
      {
        heading: "Which ones stick",
        paragraphs: [
          "Subscribed, disqualified and bot/spam are terminal - automatic classification never moves a thread off them, only you can. That's deliberate: a won customer shouldn't get demoted to 'lead' because they sent a casual message a week later.",
          "Disqualified is reserved for genuine hostility or mockery aimed at the bot. Someone venting about their own situation, profanity included, is not disqualified - they're often the most motivated lead you'll get that week.",
        ],
      },
      {
        heading: "Quality is yours, not the AI's",
        paragraphs: [
          "The good/bad quality rating is a separate, owner-only label. Nothing automatic ever writes it. Use it to mark the conversations you'd want to read again - it's the cheapest way to build a record of what a good chat on your account looks like.",
        ],
      },
    ],
  },
];

export function lessonBySlug(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}

/**
 * The "start here" path: lessons whose signal fires for this workspace, most
 * urgent first, capped at four. When nothing fires, fall back to the setup
 * sequence so a healthy account still has somewhere to begin.
 */
export function recommendedPath(signals: LearnSignals): {
  lesson: Lesson;
  reason: string;
}[] {
  const hits = LESSONS.map((lesson) => ({
    lesson,
    reason: lesson.signal(signals),
  })).filter((h): h is { lesson: Lesson; reason: string } => h.reason !== null);

  if (hits.length > 0) return hits.slice(0, 4);

  return ["knowledge-entries-that-land", "keyword-triggers", "reading-your-funnel", "tags-and-quality"]
    .map((slug) => LESSONS.find((l) => l.slug === slug))
    .filter((l): l is Lesson => !!l)
    .map((lesson) => ({ lesson, reason: "Worth a read" }));
}

/** Total reading time of a path, in minutes. */
export function pathMinutes(path: { lesson: Lesson }[]): number {
  return path.reduce((s, p) => s + p.lesson.minutes, 0);
}
