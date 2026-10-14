// lib/intake.ts
// The public client questionnaire (/intake): the questions, and the pure parser the
// POST /api/intake route runs on every submission. Pure + client-safe, so the form,
// the API route and the admin view all render from this one list.
//
// Services are the same for every client (credit repair + funding), so these
// questions are only about the CLIENT: their story, voice, selling style, proof,
// keywords and boundaries - what becomes their bot's Personality section.

export type IntakeQuestionType = "text" | "email" | "textarea" | "multi" | "single";

export interface IntakeQuestion {
  id: string;
  label: string;
  hint?: string;
  type: IntakeQuestionType;
  options?: readonly string[];
  /** multi/single only: adds an "Other" free-text box. */
  other?: boolean;
  required?: boolean;
  /** textarea height in rows. */
  rows?: number;
}

export interface IntakeSection {
  id: string;
  title: string;
  intro?: string;
  questions: readonly IntakeQuestion[];
}

export const INTAKE_SECTIONS: readonly IntakeSection[] = [
  {
    id: "basics",
    title: "The basics",
    questions: [
      { id: "name", label: "Your name, as leads should see it in DMs", hint: "Example: Keem, Coach Tasha", type: "text", required: true },
      { id: "business", label: "Business name, and short name if you use one", hint: "Example: GateKeep Solutions, GKS for short", type: "text" },
      { id: "instagram", label: "Instagram handle(s) the assistant will answer", hint: "Example: @yourhandle", type: "text", required: true },
      { id: "email", label: "Your email", hint: "We use this for your login and to reach you.", type: "email", required: true },
      { id: "city", label: "City / where you're based", type: "text" },
      { id: "signup_link", label: "Your signup or checkout link", hint: "Paste the full link, including any ?ref= part.", type: "text" },
      { id: "price", label: "Your price, the way you say it to a lead", hint: "Example: $79 a month, cancel anytime. Include any annual plan or deal.", type: "text" },
    ],
  },
  {
    id: "story",
    title: "Your story",
    intro: "Leads buy from a person. This is what makes your assistant sound like you instead of a company.",
    questions: [
      { id: "why_started", label: "Why did you start helping people with credit and funding?", type: "textarea", rows: 4 },
      { id: "own_story", label: "Your own credit or money story, if you share it with leads", hint: "Example: I fixed my own credit, learned how banks approve people and got myself funded.", type: "textarea", rows: 4 },
      { id: "different", label: "What makes you different from other credit repair or funding companies?", type: "textarea", rows: 3 },
      { id: "results", label: "Results you're proud of and OK to mention (no client names needed)", hint: "Example: 400+ clients, average 80-point increase, $2M in funding secured", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "audience",
    title: "Who you're talking to",
    questions: [
      {
        id: "lead_types", label: "Who are most of your leads? Tick all that apply.", type: "multi", other: true,
        options: ["First-time credit fixers", "People burned by another company", "Home buyers", "Car buyers", "Business owners wanting funding", "Renters / apartment hunters", "Rebuilding after bankruptcy", "Young adults building credit"],
      },
      { id: "ideal_client", label: "Describe your ideal client in a sentence or two", type: "textarea", rows: 3 },
      { id: "not_a_fit", label: "Who is NOT a fit, or who you don't want to work with?", type: "textarea", rows: 2 },
      { id: "languages", label: "What languages do your leads write in?", type: "single", options: ["English", "Spanish", "Both"], other: true },
    ],
  },
  {
    id: "voice",
    title: "How you talk",
    questions: [
      {
        id: "vibe", label: "Your vibe in DMs. Tick the ones that fit.", type: "multi",
        options: ["Casual, like texting a friend", "Professional but warm", "High energy / hype", "Calm and patient", "Funny, uses jokes", "Straight to the point", "Big brother / big sister", "Coach / teacher"],
      },
      { id: "emojis", label: "Do you use emojis?", type: "single", options: ["Never", "Only if they do first", "A few", "A lot"] },
      { id: "casing", label: "How do you write?", type: "single", options: ["all lowercase", "Normal capitals", "Mix of both"] },
      { id: "words_use", label: "Words and phrases you use all the time", hint: "Example: bet, let's get it, for sure, real talk, say less", type: "textarea", rows: 3 },
      { id: "words_never", label: "Words or phrases you would NEVER use", hint: "Example: bro, sis, guaranteed, hey there, dear", type: "textarea", rows: 2 },
      { id: "greeting", label: "How do you usually say hi to someone new who DMs you? Write it exactly.", type: "textarea", rows: 2 },
      { id: "hype", label: "How do you hype someone up when they say yes? Write it exactly.", hint: "Example: Let's go!! / That's what I like to hear", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "replies",
    title: "Show us how you'd reply",
    intro: "Write each answer exactly the way you'd type it in a DM, slang and all. This is the most important part of the form.",
    questions: [
      { id: "r_price", label: "A lead asks: \"How much is it?\"", type: "textarea", rows: 3 },
      { id: "r_legit", label: "A lead asks: \"Is this legit? How do I know you're not a scam?\"", type: "textarea", rows: 3 },
      { id: "r_scammed", label: "A lead says: \"I got scammed by another credit company before.\"", type: "textarea", rows: 3 },
      { id: "r_think", label: "A lead says: \"Let me think about it.\"", type: "textarea", rows: 3 },
      { id: "r_payday", label: "A lead says: \"I don't get paid until Friday.\"", type: "textarea", rows: 3 },
      { id: "r_bot", label: "A lead asks: \"Are you a real person or a bot?\"", type: "textarea", rows: 3 },
      { id: "r_timeline", label: "A lead asks: \"How long does it take?\"", type: "textarea", rows: 3 },
      { id: "r_ready", label: "A lead says: \"Ok I'm ready, how do I sign up?\"", type: "textarea", rows: 3 },
      { id: "real_dms", label: "Paste 2-3 real DM conversations where you closed someone", hint: "Copy the text from Instagram. Screenshots can go in the folder link at the end.", type: "textarea", rows: 10 },
    ],
  },
  {
    id: "selling",
    title: "How you sell",
    questions: [
      { id: "push", label: "How hard do you push?", type: "single", options: ["Soft, let them come to me", "Balanced", "Direct, I ask for the sale", "Very direct, I follow up a lot"] },
      { id: "link_timing", label: "When should the assistant send your signup link?", type: "single", options: ["As soon as they ask", "After they share their situation", "After answering their questions"] },
      { id: "urgency", label: "What do you say to create urgency, if anything? And what's off limits?", type: "textarea", rows: 3 },
      { id: "never_promise", label: "Anything you NEVER promise a lead", hint: "Example: a specific score, a date, approval, a funding amount", type: "textarea", rows: 3 },
      { id: "other_objections", label: "Other objections you hear a lot, and how you answer them", type: "textarea", rows: 5 },
    ],
  },
  {
    id: "proof",
    title: "Proof and trust",
    questions: [
      {
        id: "proof_types", label: "What proof can the assistant send? Tick all you have.", type: "multi",
        options: ["Before / after credit reports", "Client reviews / testimonials", "Deleted item screenshots", "Funding approvals", "Video testimonials", "None yet"],
      },
      { id: "proof_never", label: "Anything about proof the assistant should NOT share", hint: "Example: never show client names or account numbers", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "content",
    title: "Your content and keywords",
    questions: [
      { id: "keywords", label: "Keywords your posts or reels tell people to comment or DM", hint: "Example: CREDIT, 79, FUND, READY", type: "text" },
      { id: "reels_promise", label: "What do your reels or ads promise people? So the assistant matches it.", type: "textarea", rows: 3 },
      { id: "voice_note", label: "Do you want a short welcome voice note sent to new leads? You'd record a 20-30 second clip.", type: "single", options: ["Yes", "No", "Not sure"] },
      { id: "personal_ig", label: "Is your Instagram also personal (friends and family DM you there)?", type: "single", options: ["Yes, only answer people who use a keyword", "No, answer everyone"] },
    ],
  },
  {
    id: "boundaries",
    title: "Boundaries and handoff",
    questions: [
      { id: "avoid_topics", label: "Topics the assistant should stay away from", hint: "Example: politics, religion, specific lenders", type: "textarea", rows: 2 },
      { id: "handoff", label: "When should the assistant stop and hand the chat to you?", hint: "Example: billing problems, angry clients, anyone asking about the 1-on-1 program", type: "textarea", rows: 3 },
      { id: "other_products", label: "Do you sell anything else besides the main program? Name, price, who it's for.", hint: "The assistant mentions it only when it fits, and hands those leads to you.", type: "textarea", rows: 3 },
      { id: "files_link", label: "Link to a folder with your screenshots and proof images (Google Drive, Dropbox...)", hint: "Make sure the folder is shared so anyone with the link can view it.", type: "text" },
      { id: "anything_else", label: "Anything else we should know about you, your audience or how you want to come across?", type: "textarea", rows: 5 },
    ],
  },
];

export const INTAKE_QUESTIONS: readonly IntakeQuestion[] = INTAKE_SECTIONS.flatMap((s) => s.questions);

/** Per-field size caps: generous for real answers, bounded so one post can't be huge. */
export const MAX_TEXT_CHARS = 500;
export const MAX_TEXTAREA_CHARS = 8000;

export type IntakeAnswer = string | string[];
export type IntakeAnswers = Record<string, IntakeAnswer>;

export interface IntakeParsed {
  name: string;
  email: string;
  instagram: string;
  business: string | null;
  answers: IntakeAnswers;
}

export type IntakeParseResult =
  | { ok: true; value: IntakeParsed }
  | { ok: false; spam?: true; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Key for a multi/single question's "Other" free-text box. */
export const otherKey = (id: string) => `${id}__other`;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

/**
 * Validate a raw submission body `{ answers, website }`. `website` is a honeypot the
 * form hides from people: anything in it marks a bot and the submission is dropped.
 * Unknown keys are ignored, strings are trimmed and capped, choices must be one of the
 * question's options. Total: never throws.
 */
export function parseIntakeSubmission(raw: unknown): IntakeParseResult {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (str(body.website, 200)) return { ok: false, spam: true, errors: {} };
  const input = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, unknown>;

  const answers: IntakeAnswers = {};
  const errors: Record<string, string> = {};

  for (const q of INTAKE_QUESTIONS) {
    const v = input[q.id];
    if (q.type === "multi") {
      const picked = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      const valid = [...new Set(picked.filter((x) => q.options?.includes(x)))];
      if (valid.length) answers[q.id] = valid;
    } else if (q.type === "single") {
      const s = str(v, MAX_TEXT_CHARS);
      if (s && q.options?.includes(s)) answers[q.id] = s;
    } else {
      const s = str(v, q.type === "textarea" ? MAX_TEXTAREA_CHARS : MAX_TEXT_CHARS);
      if (s) answers[q.id] = s;
    }
    if (q.other) {
      const o = str(input[otherKey(q.id)], MAX_TEXT_CHARS);
      if (o) answers[otherKey(q.id)] = o;
    }
    if (q.required && !answers[q.id]) errors[q.id] = "Please fill this in.";
  }

  const email = typeof answers.email === "string" ? answers.email : "";
  if (email && !EMAIL_RE.test(email)) errors.email = "That email doesn't look right.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: answers.name as string,
      email: email.toLowerCase(),
      instagram: answers.instagram as string,
      business: typeof answers.business === "string" ? answers.business : null,
      answers,
    },
  };
}

/** One submission as plain text, section by section, for copying into a prompt draft. */
export function intakeToPlainText(answers: IntakeAnswers): string {
  const out: string[] = [];
  for (const s of INTAKE_SECTIONS) {
    const lines: string[] = [];
    for (const q of s.questions) {
      const v = answers[q.id];
      const other = q.other ? answers[otherKey(q.id)] : undefined;
      const parts = [Array.isArray(v) ? v.join(", ") : v, other ? `Other: ${other}` : ""].filter(Boolean);
      if (!parts.length) continue;
      lines.push(`${q.label}\n${parts.join(" / ")}`);
    }
    if (lines.length) out.push(`## ${s.title.toUpperCase()}\n\n${lines.join("\n\n")}`);
  }
  return out.join("\n\n");
}
