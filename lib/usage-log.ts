// lib/usage-log.ts - one usage_log row per AI call, with the model and the token split
// (input, the cached part of that input, output), so cost per bot and the prompt-cache
// hit rate can be read from the table. Best-effort: a logging failure never reaches the
// caller, and never costs the lead a reply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumnFrom } from "./reset-conversation";

/** What one AI call spent. inputTokens includes cachedTokens (OpenAI's convention). */
export interface TokenDetail {
  model: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

/** Who an AI call is billed to, and the usage_log event it is recorded under. */
export interface AiUsageTag {
  db: SupabaseClient;
  userId: string;
  chatbotId: string | null;
  event: string;
}

export interface UsageRow {
  user_id: string;
  chatbot_id: string | null;
  event_type: string;
  tokens_used: number;
}

/** Columns added by supabase/migrations/2026-10-30-usage-log-token-detail.sql. */
const DETAIL_COLUMNS = ["model", "input_tokens", "cached_tokens", "output_tokens"];
let warnedNoDetailColumns = false;

/** A tag that bills a call to the bot's owner. */
export function usageTag(
  db: SupabaseClient,
  chatbot: { id: string; user_id: string },
  event: string
): AiUsageTag {
  return { db, userId: chatbot.user_id, chatbotId: chatbot.id, event };
}

/**
 * Insert a usage_log row, with the token split when there is one. Until the migration
 * is applied the split columns do not exist and the insert is refused whole, which would
 * also lose the ai_reply rows that reply counts and billing read; the row is then
 * written again without them. Never throws.
 */
export async function insertUsageRow(
  db: SupabaseClient,
  row: UsageRow,
  detail?: TokenDetail | null
): Promise<void> {
  try {
    const full = detail
      ? {
          ...row,
          model: detail.model,
          input_tokens: detail.inputTokens,
          cached_tokens: detail.cachedTokens,
          output_tokens: detail.outputTokens,
        }
      : row;
    const { error } = await db.from("usage_log").insert(full);
    if (!error) return;
    if (detail && missingColumnFrom(error, DETAIL_COLUMNS)) {
      if (!warnedNoDetailColumns) {
        warnedNoDetailColumns = true;
        console.warn("[usage-log] token columns missing; apply 2026-10-30-usage-log-token-detail.sql");
      }
      const retry = await db.from("usage_log").insert(row);
      if (retry.error) console.warn("[usage-log] insert failed", retry.error.message);
      return;
    }
    console.warn("[usage-log] insert failed", error.message);
  } catch (err) {
    console.warn("[usage-log] insert failed", err);
  }
}

/** The row for one tagged AI call. */
export function logAiCall(tag: AiUsageTag, tokensUsed: number, detail: TokenDetail): Promise<void> {
  return insertUsageRow(
    tag.db,
    { user_id: tag.userId, chatbot_id: tag.chatbotId, event_type: tag.event, tokens_used: tokensUsed },
    detail
  );
}
