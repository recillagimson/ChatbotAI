/**
 * Lead contact capture: spot a phone number or email a lead typed in a DM, so the
 * team can reach them outside SpeedSettr. On a new one the webhook saves it on the
 * conversation (lead_phone / lead_email), flags the thread needs_human and posts a
 * Slack alert (lib/lead-contact-server.ts).
 *
 * Pure, no AI: a fixed pattern check. Phone rules are strict on purpose, because a
 * false hit pings the team's Slack: 10 digits, 11 starting with 1 or 0, or 8-15
 * digits after a "+". That keeps credit scores, prices, dates and years out.
 * Links are removed before matching so digits inside a URL never count.
 * Multi-tenant: nothing here is client-specific. Tests: tests/lead-contact.spec.ts.
 */

export interface LeadContacts {
  emails: string[];
  phones: string[];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// A run of digit groups joined by single spaces, dots, dashes or parentheses,
// optionally starting with "+". Not preceded/followed by a letter or digit, so a
// number glued to other text ("abc5551234567", "5551234567xyz") is skipped.
const PHONE_RE = /(?<![\w+])\+?\(?\d[\d().\s-]{6,}\d(?![\w])/g;

function phoneFrom(raw: string): string | null {
  // Only one separator character between digit groups (a list like
  // "649  720" with double spacing, or "1--2", is not a phone shape).
  if (/[\s.-]{2,}/.test(raw.replace(/[()]/g, ""))) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return digits;
  if (digits.length === 11 && (digits[0] === "1" || digits[0] === "0")) return digits;
  return null;
}

/** Same number typed two ways ("+1 555..." vs "555...") compares equal. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Every distinct email and phone in a message. Never throws. */
export function extractLeadContacts(text: unknown): LeadContacts {
  const out: LeadContacts = { emails: [], phones: [] };
  if (typeof text !== "string" || !text.trim()) return out;
  try {
    const noUrls = text.replace(URL_RE, " ");
    for (const m of noUrls.match(EMAIL_RE) ?? []) {
      const email = m.toLowerCase().replace(/\.+$/, "");
      if (!out.emails.includes(email)) out.emails.push(email);
    }
    const noEmails = noUrls.replace(EMAIL_RE, " ");
    for (const m of noEmails.match(PHONE_RE) ?? []) {
      const phone = phoneFrom(m.trim());
      if (phone && !out.phones.some((p) => phoneKey(p) === phoneKey(phone))) {
        out.phones.push(phone);
      }
    }
  } catch {
    return { emails: [], phones: [] };
  }
  return out;
}

/**
 * The contacts in this message that are not already saved on the conversation.
 * Null when there is nothing new (no alert, no write). Takes the first new one of
 * each kind.
 */
export function newLeadContacts(
  saved: { lead_phone?: string | null; lead_email?: string | null } | null | undefined,
  found: LeadContacts
): { phone: string | null; email: string | null } | null {
  const savedPhone = saved?.lead_phone ? phoneKey(saved.lead_phone) : null;
  const savedEmail = saved?.lead_email?.toLowerCase() ?? null;
  const phone = found.phones.find((p) => phoneKey(p) !== savedPhone) ?? null;
  const email = found.emails.find((e) => e !== savedEmail) ?? null;
  return phone || email ? { phone, email } : null;
}

/** US numbers read as "(555) 123-4567" / "+1 (555) 123-4567"; others as stored. */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const us = (n: string) => `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  if (d.length === 10 && !phone.startsWith("+")) return us(d);
  if (d.length === 11 && d[0] === "1") return `+1 ${us(d.slice(1))}`;
  return phone;
}

// Slack mrkdwn treats &, < and > as control characters.
function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface LeadContactAlert {
  botName: string | null;
  platform: string | null;
  leadName: string | null;
  handle: string | null;
  phone: string | null;
  email: string | null;
  message: string;
  conversationUrl: string | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  tiktok: "TikTok",
};

/** The Slack Incoming Webhook body for one alert. */
export function buildSlackLeadAlert(a: LeadContactAlert): {
  text: string;
  blocks: unknown[];
} {
  const who = a.leadName || (a.handle ? `@${a.handle}` : "A lead");
  const channel = a.platform ? PLATFORM_LABEL[a.platform] ?? a.platform : null;
  const bot = a.botName || "a chatbot";
  const msg = a.message.length > 500 ? `${a.message.slice(0, 500)}…` : a.message;

  const lines = [
    `*Bot:* ${slackEscape(bot)}${channel ? ` · ${channel}` : ""}`,
    `*Lead:* ${slackEscape(who)}${a.handle && a.leadName ? ` (@${slackEscape(a.handle)})` : ""}`,
  ];
  if (a.phone) lines.push(`*Phone:* ${slackEscape(formatPhone(a.phone))}`);
  if (a.email) lines.push(`*Email:* ${slackEscape(a.email)}`);

  const blocks: unknown[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `:telephone_receiver: *New lead contact* from ${slackEscape(who)}` },
    },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Message:*\n>${slackEscape(msg).replace(/\n/g, "\n>")}` },
    },
  ];
  if (a.conversationUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open conversation" },
          url: a.conversationUrl,
        },
      ],
    });
  }
  const contact = [a.phone ? formatPhone(a.phone) : null, a.email].filter(Boolean).join(" · ");
  return { text: `New lead contact from ${who} (${bot}): ${contact}`, blocks };
}
