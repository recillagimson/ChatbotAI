-- Token detail per AI call on usage_log (token-cost plan, step 1).
--
-- Every AI call now records which model ran and its token split: input tokens, how many
-- of those were read from the prompt cache, and output tokens. The reply's ai_reply /
-- ai_silent row and the followup_ai row carry it, a generated reply that was thrown away
-- (superseded, or the bot was stopped meanwhile) leaves ai_reply_discarded, and each side
-- call leaves a row of its own (event_type ai_call_question_gate, ai_call_screen, ai_call_tags, ai_call_facts,
-- ai_call_memory, ai_call_flow_state, ai_call_vision, ai_call_preview,
-- ai_call_suggest_reply, ai_call_training_suggest, ai_call_change_assistant). Reply
-- counts and billing read ai_reply only, so the new rows do not change them.
--
-- All nullable, no default: older rows stay null. The app writes these columns and, until
-- this is applied, writes each row again without them (lib/usage-log.ts), so nothing is
-- lost before it runs.
--
-- Re-runnable. Apply in the Supabase dashboard SQL editor.
-- Rollback: alter table public.usage_log drop column if exists model,
--   drop column if exists input_tokens, drop column if exists cached_tokens,
--   drop column if exists output_tokens;

alter table public.usage_log
  add column if not exists model text,           -- model id the call asked for
  add column if not exists input_tokens int,     -- prompt tokens, cached ones included
  add column if not exists cached_tokens int,    -- the part of input_tokens read from the prompt cache
  add column if not exists output_tokens int;    -- completion tokens, reasoning included

-- Cost per bot and cache hit rate, last 7 days:
--   select chatbot_id, event_type, model, count(*) as calls,
--          sum(input_tokens) as input, sum(cached_tokens) as cached, sum(output_tokens) as output,
--          round(100.0 * sum(cached_tokens) / nullif(sum(input_tokens), 0), 1) as cache_hit_pct
--   from public.usage_log
--   where created_at > now() - interval '7 days' and model is not null
--   group by 1, 2, 3 order by input desc;
