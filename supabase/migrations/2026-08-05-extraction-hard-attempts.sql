-- Graceful stand-down should fire on 2 BLATANT (HARD) extraction attempts, not on
-- 2 detections of any tier - otherwise a curious lead who asks a SOFT model-identity
-- question then a HARD one gets handed off after two innocuous messages. Track HARD
-- attempts separately from the all-tier extraction_attempts (which still drives the
-- inbox "Flagged" badge). Also used to tell an extraction auto-pause apart from a
-- manual human takeover (both set status='ai_paused').
alter table public.conversations
  add column if not exists extraction_hard_attempts integer not null default 0;
