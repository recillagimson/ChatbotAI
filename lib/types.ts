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
}

export interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  business_description: string | null;
  tone: "friendly" | "professional" | "casual" | "enthusiastic";
  manychat_page_id: string | null;
  instagram_username: string | null;
  system_prompt: string | null;
  is_active: boolean;
  retrieval_active: boolean;
  auto_followup_enabled: boolean;
  auto_followup_days: number;
  auto_followup_repeat: boolean;
  auto_followup_max: number;
  auto_followup_template: string | null;
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
  contact_name: string | null;
  contact_username: string | null;
  status: "active" | "ai_paused" | "closed";
  last_message_at: string;
  last_followup_at: string | null;
  followup_count: number;
  unread_count: number;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "human_agent";
  content: string;
  ai_generated: boolean;
  tokens_used: number | null;
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

export interface ChangeProposal {
  system_prompt?: string;                          // omitted/empty = leave the prompt unchanged
  kb_entries?: { title: string; content: string }[]; // NEW kb entries to add (may be omitted/empty)
  summary: string;                                 // plain-English "what changed and why" for the team
}

// The team-finalized payload chosen at Approve (no summary needed).
export interface ChangeFinal {
  system_prompt?: string;
  kb_entries?: { title: string; content: string }[];
}

export interface ChangeRequest {
  id: string;
  chatbot_id: string;
  user_id: string;
  request_text: string;
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
  created_at: string;
}
