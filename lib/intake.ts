// lib/intake.ts
// The public client questionnaire (/intake): the questions, and the pure parser the
// POST /api/intake route runs on every submission. Pure + client-safe, so the form,
// the API route and the admin view all render from this one list.
//
// Services, rebuttals and the knowledge base are shared across clients (credit repair
// + funding), so this only asks for the client's business details, their personality,
// and how they'd reply to a lead - what becomes their bot's Personality section.

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
    id: "business",
    title: "Your business",
    questions: [
      { id: "name", label: "Your name, as leads should see it in DMs", hint: "Example: Keem, Coach Tasha", type: "text", required: true },
      { id: "business", label: "Business name, and short name if you use one", hint: "Example: GateKeep Solutions, GKS for short", type: "text" },
      { id: "instagram", label: "Instagram handle(s) the assistant will answer", hint: "Example: @yourhandle", type: "text", required: true },
      { id: "email", label: "Your email", type: "email", required: true },
      { id: "city", label: "City / where you're based", type: "text" },
      { id: "signup_link", label: "Your signup or checkout link", hint: "Paste the full link, including any ?ref= part.", type: "text" },
    ],
  },
  {
    id: "voice",
    title: "Your personality",
    questions: [
      {
        id: "vibe", label: "Your vibe in DMs. Tick the ones that fit.", type: "multi",
        options: ["Casual, like texting a friend", "Professional but warm", "High energy / hype", "Calm and patient", "Funny, uses jokes", "Straight to the point", "Big brother / big sister", "Coach / teacher"],
      },
      { id: "emojis", label: "Do you use emojis?", type: "single", options: ["Never", "Only if they do first", "A few", "A lot"] },
      { id: "casing", label: "How do you write?", type: "single", options: ["all lowercase", "Normal capitals", "Mix of both"] },
      { id: "words_use", label: "Words and phrases you use all the time", hint: "Example: bet, let's get it, for sure, real talk", type: "textarea", rows: 2 },
      { id: "words_never", label: "Words you would NEVER use", hint: "Example: bro, sis, guaranteed, hey there", type: "textarea", rows: 2 },
      { id: "own_story", label: "Your story in a few lines, if you share it with leads", hint: "Example: I fixed my own credit, learned how banks approve people and got myself funded.", type: "textarea", rows: 3 },
      { id: "voice_note", label: "Want a short welcome voice note sent to new leads? You'd record a 20-30 second clip.", type: "single", options: ["Yes", "No", "Not sure"] },
    ],
  },
  {
    id: "replies",
    title: "How you'd reply to a lead",
    intro: "Type each answer exactly the way you would in a DM, slang and all. Short is fine.",
    questions: [
      { id: "greeting", label: "Someone new DMs you: \"hey\"", type: "textarea", rows: 2 },
      { id: "r_price", label: "\"How much is it?\"", type: "textarea", rows: 2 },
      { id: "r_legit", label: "\"Is this legit?\"", type: "textarea", rows: 2 },
      { id: "r_scammed", label: "\"I got scammed by another credit company before.\"", type: "textarea", rows: 2 },
      { id: "r_think", label: "\"Let me think about it.\"", type: "textarea", rows: 2 },
      { id: "r_bot", label: "\"Are you a real person or a bot?\"", type: "textarea", rows: 2 },
      { id: "hype", label: "\"Ok I'm ready, how do I sign up?\"", type: "textarea", rows: 2 },
      { id: "real_dms", label: "Optional: paste a real DM conversation where you closed someone", type: "textarea", rows: 6 },
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
