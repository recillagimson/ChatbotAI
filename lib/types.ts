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
