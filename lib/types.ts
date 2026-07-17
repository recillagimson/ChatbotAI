import type { Platform } from "./platforms";
import type { ConversationTag } from "./conversation-tags";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  comp_expires_at: string | null;   // admin comp grant end; null on Stripe subs
  comp_granted_at: string | null;
  comp_granted_by: string | null;   // superadmin profile id
  comp_note: string | null;
}

export interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  business_description: string | null;
  tone: "friendly" | "professional" | "casual" | "enthusiastic";
  manychat_page_id: string | null;
  manychat_api_key_enc: string | null;  // AES-256-GCM ciphertext of the ManyChat API key; null = env fallback
  webhook_secret: string;               // per-chatbot inbound webhook secret (plaintext; NOT NULL in DB)
  instagram_username: string | null;
  system_prompt: string | null;        // legacy single prompt; used as fallback when the 3 sections are all empty
  persona_section: string | null;      // 1. personality / tone (leads as identity)
  offers_section: string | null;       // 2. offers & services / inclusions & exclusions / links
  rebuttals_section: string | null;    // 3. rebuttals, FAQs
  is_active: boolean;
  retrieval_active: boolean;
  auto_followup_enabled: boolean;
  auto_followup_days: number;
  auto_followup_repeat: boolean;
  auto_followup_max: number;
  auto_followup_template: string | null;
  auto_followup_steps: FollowupStep[];   // ordered rich-media drip steps (JSONB)
  auto_followup_loop_last: boolean;       // legacy; superseded by auto_followup_loop_mode
  auto_followup_loop_mode: FollowupLoopMode; // after the last step: stop | repeat last | cycle through all
  ai_media_enabled: boolean;              // allow the live AI to emit [[SEND_ASSET]] directives
  keyword_triggers: KeywordGroup[];       // per-chatbot keyword auto-reply groups (JSONB)
  training_pairs: TrainingPair[];         // Bot Trainer scenario corrections (JSONB)
  keyword_gate_enabled: boolean;          // ON = reply ONLY to DMs matching a keyword group; else silent
  keyword_strict_enabled: boolean;        // ON = keyword match requires the whole message to equal the keyword (else contains-match)
  followup_flag_enabled: boolean;         // ON = mirror stop-follow-up state to ManyChat tag `ss_no_followup`
  welcome_enabled: boolean;
  welcome_flow_ns: string | null;
  welcome_flow_name: string | null;
  welcome_keywords: string[];
  welcome_use_keyword_triggers: boolean;  // ON = Welcome VM also fires on a keyword_triggers match
  created_at: string;
}

/** One Bot Trainer correction: in a scenario, reply THIS instead. */
export interface TrainingPair {
  id: string;                 // stable uuid
  scenario: string;           // the triggering user message / situation ("what is your price")
  reply: string;              // what to say in this scenario
  bad_reply?: string | null;  // the bot's original (rejected) reply, for an "instead of X, say Y" contrast
  exact?: boolean;            // true = reply verbatim; false/absent = reworded into the bot's voice
  note?: string | null;       // optional owner note
  enabled: boolean;
}

/** How a keyword group behaves when a contact matches it AGAIN (already got the first reply). */
export type KeywordOnRepeat = "ai" | "message" | "instruction";

/**
 * One keyword group on a chatbot. The webhook matches an inbound DM's text
 * against `keywords` (case-insensitive whole-word "contains"): a group matches
 * if the message contains ANY include keyword AND NO `exclude` keyword. The
 * first match for a contact sends `first_reply_text` (+ optional asset); later
 * matches run `on_repeat`.
 */
export interface KeywordGroup {
  id: string;                          // stable uuid minted in the editor; keys keyword_fired
  keywords: string[];                  // include list (empty = never matches)
  exclude: string[];                   // if any of these appear, the group does NOT match
  first_reply_mode: KeywordOnRepeat;   // FIRST match: message = send first_reply_text; ai = hand to AI; instruction = AI + first_reply_instruction
  first_reply_text: string;            // canned reply sent on the first match when mode="message" (stored RAW; sanitized outbound)
  first_reply_asset_key?: string | null;  // optional FollowupAsset key attached to the first reply (mode="message")
  first_reply_instruction?: string | null; // one-line per-turn prompt addition for first_reply_mode="instruction"
  on_repeat: KeywordOnRepeat;          // LATER matches: ai = fall through to AI; message = send repeat_text; instruction = AI + inject instruction
  repeat_text?: string | null;         // canned text for on_repeat="message"
  instruction?: string | null;         // one-line per-turn prompt addition for on_repeat="instruction"
  enabled: boolean;
}

/** What the drip does once it reaches the end of the step sequence. */
export type FollowupLoopMode = "stop" | "repeat_last" | "cycle";

/** One step in a chatbot's auto follow-up drip sequence. */
export interface FollowupStep {
  delay_hours: number;         // hours after the previous send (or the contact's last message for step 1)
  asset_key?: string | null;   // LEGACY single key — still read for steps saved before multi-asset
  asset_keys?: string[];       // keys of FollowupAssets to send in this step (supersedes asset_key)
  text?: string | null;        // caption / message body; supports {{name}}. Always sent when present.
  ai_generate?: boolean;       // when true, the AI writes this step's message from the conversation; `text` (if any) is guidance for the AI. Ignored when a flow fires.
  flow_ns?: string | null;     // when set, this step TRIGGERS this ManyChat flow (voice) instead of sending media
  flow_name?: string | null;   // display label for the flow (from ManyChat getFlows); UI-only
  flow_ns_fb?: string | null;   // Facebook (Messenger) flow; when set, fires for messenger subscribers (falls back to flow_ns)
  flow_name_fb?: string | null; // display label for the Facebook flow (from ManyChat getFlows); UI-only
}

export type FollowupAssetKind = "image" | "video" | "audio" | "link";

/** A reusable media/link asset in a chatbot's follow-up library. */
export interface FollowupAsset {
  id: string;
  chatbot_id: string;
  user_id: string;
  key: string;                 // short handle referenced by steps + AI directives
  label: string | null;
  description: string | null;  // what it is / when to send (fed to the AI)
  kind: FollowupAssetKind;
  storage_path: string | null; // path in the followup-assets bucket (null for link)
  url: string | null;          // public media URL, or external link (kind='link')
  mime: string | null;
  created_at: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  chatbot_id: string;
  user_id: string;
  title: string;
  content: string;
  source_type: "manual" | "upload" | "url";
  source_name: string | null;
  indexed: boolean;
  needs_review: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  chatbot_id: string;
  user_id: string;
  manychat_subscriber_id: string;
  platform: Platform;
  contact_name: string | null;
  contact_username: string | null;
  status: "active" | "ai_paused" | "closed";
  last_message_at: string;
  last_followup_at: string | null;
  followup_count: number;
  followup_step_index: number;       // next drip step to send (0-based)
  confirmed_at: string | null;       // lead marked won (stops the drip); null = still open
  confirmed_by: "manual" | "ai" | null;
  tag: ConversationTag;              // inbox bucket: lead | wants_call | starting_later | needs_human | subscribed | disqualified | bot (default 'lead')
  start_on: string | null;           // starting_later: the date (YYYY-MM-DD) the lead wants to begin; pauses the drip
  start_note: string | null;         // starting_later: the human phrase ("Wednesday", "in a week")
  rn_opt_in_at: string | null;       // Recurring Notifications opt-in (Phase 6, multi-day reach)
  rn_topic_id: string | null;
  reply_claimed_for: string | null;  // inbound message id of the newest AI-bound run (debounce single-flight claim)
  keyword_fired: string[];           // ids of keyword groups whose first reply this contact already received
  is_lead: boolean;                  // PARKED: column kept but no longer written/read (is_leads tagging disabled — see CLAUDE.md #19)
  extraction_attempts: number;       // prompt-extraction detections on this thread (red "Flagged" badge when > 0)
  flagged_at: string | null;         // when the newest extraction attempt was detected
  user_muted_at: string | null;      // lead self-paused the AI via "stopmessage" (null = not muted); independent of status
  bot_off_at: string | null;         // ManyChat BOT_OFF tag sync (null = bot on); fully silences the bot for this subscriber
  bot_forced_on_at: string | null;   // ManyChat BOT_ON tag sync (null = no override); force-engages the contact so the keyword gate is bypassed
  welcomed_at: string | null;
  unread_count: number;
  memory_summary: string | null;     // rolling summary of turns older than the verbatim window
  memory_summary_at: string | null;  // created_at watermark of the newest message folded into the summary
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "human_agent";
  content: string;
  ai_generated: boolean;
  tokens_used: number | null;
  media_url: string | null;   // inbound attachment: storage path (request-uploads) or URL; null = text only
  media_type: string | null;  // inbound attachment MIME type; null = text only
  created_at: string;
}

export interface KbChunk {
  id: string;
  knowledge_base_id: string;
  chatbot_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  embedding_model: string | null;
  created_at: string;
}

// Which prompt section a request targets. "other" = knowledge-base / misc (no section).
export type ChangeCategory = "personality" | "offers" | "rebuttals" | "other";

export interface ChangeProposal {
  section?: "persona_section" | "offers_section" | "rebuttals_section"; // column the section_content targets
  section_content?: string;                        // FULL revised text for the targeted section
  system_prompt?: string;                          // LEGACY — still honored for old rows; omitted/empty = no change
  kb_entries?: { title: string; content: string }[]; // NEW kb entries to add (may be omitted/empty)
  summary: string;                                 // plain-English "what changed and why" for the team
}

// The team-finalized payload chosen at Approve (no summary needed).
export interface ChangeFinal {
  section?: "persona_section" | "offers_section" | "rebuttals_section";
  section_content?: string;
  system_prompt?: string;                          // LEGACY fallback for old requests
  kb_entries?: { title: string; content: string }[];
}

export interface ChangeRequest {
  id: string;
  chatbot_id: string;
  user_id: string;
  request_text: string;
  category: ChangeCategory;
  status: "draft" | "pending" | "approved" | "applied" | "rejected";
  proposed: ChangeProposal | null;
  transcript: TranscriptMessage[];
  title: string | null;
  model_used: string | null;
  draft_error: string | null;
  final: ChangeFinal | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  chatbot_id: string | null;
  message: string;
  status: "new" | "read" | "resolved";
  attachments: Attachment[];
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Attachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  images?: { path: string; name: string }[];  // storage paths (user messages only)
  files?: { path: string; name: string; type: string }[];  // document attachments read as text (user messages only)
  created_at: string;
}
