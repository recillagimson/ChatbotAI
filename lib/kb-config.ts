// lib/kb-config.ts
// Single source of truth for KB sizing + retrieval tunables.
// Imported by lib/anthropic.ts, lib/retrieval.ts, lib/embeddings.ts.

/** Full-context block soft cap (~12k tokens). Below this, inject everything. */
export const KB_CHAR_BUDGET = Number(process.env.KB_CHAR_BUDGET ?? 48_000);

/** Switch INTO retrieval only above this (dead-band vs KB_CHAR_BUDGET = hysteresis).
 *  INVARIANT: RETRIEVAL_CUTOVER >= KB_CHAR_BUDGET, or the dead band INVERTS and a bot
 *  sized between them flips mode on EVERY reply (whole KB one turn, a 14k slice the
 *  next) - which is precisely the input instability that makes a prose-encoded flow
 *  skip steps, plus a prompt-cache bust and an extra DB write per reply. Clamped here
 *  so env can never break it; no behavior change at the default values. */
export const RETRIEVAL_CUTOVER = Math.max(
  Number(process.env.RETRIEVAL_CUTOVER ?? 64_000),
  KB_CHAR_BUDGET
);

/** Cap on the assembled retrieved-chunk block (chars). */
export const RETRIEVAL_CHAR_BUDGET = Number(process.env.RETRIEVAL_CHAR_BUDGET ?? 14_000);

/** SQL fetch ceiling for match_kb_chunks. */
export const RETRIEVAL_TOP_K = Number(process.env.RETRIEVAL_TOP_K ?? 8);

/** Cosine-similarity floor; below this a chunk is dropped (tune via eval). */
export const RETRIEVAL_MIN_SIMILARITY = Number(process.env.RETRIEVAL_MIN_SIMILARITY ?? 0.3);

/** OpenAI embedding model + its vector dimension (must match schema vector(N)). */
export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

/** Chunking (char-based ≈ tokens*4). ~900 tokens target, ~100 overlap. */
export const CHUNK_TARGET_CHARS = Number(process.env.CHUNK_TARGET_CHARS ?? 3_600);
export const CHUNK_OVERLAP_CHARS = Number(process.env.CHUNK_OVERLAP_CHARS ?? 400);

/** Reply-time embed timeout - exceed it → fall back to full-context. */
export const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 2_000);

/** OpenAI per-request input cap (texts). We stay well under 2048. */
export const EMBED_MAX_BATCH = Number(process.env.EMBED_MAX_BATCH ?? 256);

/** Per-chatbot total KB chars cap (bounds embedding cost + sync latency). */
export const MAX_KB_CHARS_PER_CHATBOT = Number(process.env.MAX_KB_CHARS_PER_CHATBOT ?? 2_000_000);
