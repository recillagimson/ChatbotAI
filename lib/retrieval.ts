// lib/retrieval.ts
import { KB_CHAR_BUDGET, RETRIEVAL_CUTOVER, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS } from "./kb-config";

export type KbEntryLite = { title: string; content: string };

const SEP = "\n\n---\n\n";
const NO_KB =
  "(No knowledge base entries yet — answer only based on the business description and politely defer if asked something you cannot confirm.)";

function entryText(e: KbEntryLite): string {
  return `### ${e.title}\n${e.content}`;
}

/**
 * Structure-aware chunking: split on blank-line blocks (paragraphs/headings),
 * pack into ~targetChars chunks, carry an overlap tail across boundaries, and
 * hard-split any single block larger than the target.
 */
export function chunkText(
  text: string,
  targetChars = CHUNK_TARGET_CHARS,
  overlapChars = CHUNK_OVERLAP_CHARS
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const blocks = clean.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const block of blocks) {
    if (block.length > targetChars) {
      if (cur) { chunks.push(cur); cur = ""; }
      for (let i = 0; i < block.length; i += targetChars) {
        chunks.push(block.slice(i, i + targetChars));
      }
      continue;
    }
    if (cur && cur.length + SEP.length + block.length > targetChars) {
      chunks.push(cur);
      const tail = cur.slice(Math.max(0, cur.length - overlapChars));
      cur = `${tail}\n\n${block}`;
    } else {
      cur = cur ? `${cur}\n\n${block}` : block;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Length of the assembled full-context block, untruncated (titles + seps). */
export function assembledSize(entries: KbEntryLite[]): number {
  if (entries.length === 0) return 0;
  return (
    entries.reduce((n, e) => n + entryText(e).length, 0) +
    SEP.length * (entries.length - 1)
  );
}

/** Full-context KB block, truncated at KB_CHAR_BUDGET (moved from anthropic.ts). */
export function buildFullContextBlock(entries: KbEntryLite[]): string {
  if (entries.length === 0) return NO_KB;
  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  for (const e of entries) {
    const t = entryText(e);
    if (parts.length > 0 && used + t.length > KB_CHAR_BUDGET) {
      truncated = true;
      break;
    }
    parts.push(t);
    used += t.length;
  }
  let block = parts.join(SEP);
  if (truncated) {
    block += `${SEP}…(knowledge base truncated — some entries were omitted to stay within limits)`;
  }
  return block;
}

/**
 * Pick reply mode. Hysteresis: engage retrieval above RETRIEVAL_CUTOVER, but
 * once active stay in retrieval until size drops back below KB_CHAR_BUDGET.
 * Safety: no key or any unindexed entry → full-context.
 */
export function decideMode(opts: {
  size: number;
  hasUnindexed: boolean;
  embeddingsEnabled: boolean;
  currentlyActive: boolean;
}): "full" | "retrieval" {
  if (!opts.embeddingsEnabled || opts.hasUnindexed) return "full";
  if (opts.currentlyActive) return opts.size > KB_CHAR_BUDGET ? "retrieval" : "full";
  return opts.size > RETRIEVAL_CUTOVER ? "retrieval" : "full";
}

/** Build the retrieval query from the last turns + current message. */
export function buildQueryString(
  history: { role: string; content: string }[],
  userMessage: string
): string {
  const tail = history.slice(-2).map((m) => m.content);
  return [...tail, userMessage].join("\n").slice(0, 4000);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chatbot, Message } from "./types";
import { embed, embedQuery, isEmbeddingsEnabled } from "./embeddings";
import {
  OPENAI_EMBEDDING_MODEL,
  RETRIEVAL_TOP_K,
  RETRIEVAL_MIN_SIMILARITY,
  RETRIEVAL_CHAR_BUDGET,
} from "./kb-config";

/**
 * (Re)index one knowledge_base entry: delete its existing chunks, chunk + embed
 * the content, insert the full set in one batch, then flip indexed=true. All-or-
 * nothing: on any failure, delete partial chunks so state is (indexed=false, 0
 * chunks). No-op when embeddings are disabled (entry stays indexed=false, served
 * via full-context). Caller passes a SERVICE-ROLE client.
 */
export async function indexEntry(
  supabase: SupabaseClient,
  entry: { id: string; chatbot_id: string; user_id: string; content: string }
): Promise<{ indexed: boolean; chunks: number }> {
  if (!isEmbeddingsEnabled()) return { indexed: false, chunks: 0 };

  await supabase.from("kb_chunks").delete().eq("knowledge_base_id", entry.id);

  const pieces = chunkText(entry.content);
  if (pieces.length === 0) {
    await supabase.from("knowledge_base").update({ indexed: true }).eq("id", entry.id);
    return { indexed: true, chunks: 0 };
  }

  try {
    const vectors = await embed(pieces, { inputType: "document" });
    const rows = pieces.map((content, i) => ({
      knowledge_base_id: entry.id,
      chatbot_id: entry.chatbot_id,
      user_id: entry.user_id,
      chunk_index: i,
      content,
      embedding: vectors[i],
      embedding_model: OPENAI_EMBEDDING_MODEL,
    }));
    const { error } = await supabase.from("kb_chunks").insert(rows);
    if (error) throw new Error(error.message);
    await supabase.from("knowledge_base").update({ indexed: true }).eq("id", entry.id);
    return { indexed: true, chunks: rows.length };
  } catch (err) {
    // Roll back any partial write; leave entry usable via full-context.
    await supabase.from("kb_chunks").delete().eq("knowledge_base_id", entry.id);
    await supabase.from("knowledge_base").update({ indexed: false }).eq("id", entry.id);
    console.error("[retrieval] indexEntry failed", err);
    return { indexed: false, chunks: 0 };
  }
}

export interface KbBlockResult {
  block: string;
  mode: "full" | "retrieval" | "fallback";
  chunks: number;
  topSimilarity: number | null;
}

/**
 * Reply-time KB resolver. Fetches the chatbot's entries, picks a mode (with
 * hysteresis persisted on chatbots.retrieval_active), and returns a pre-built
 * KB-block string. Retrieval errors/timeouts fall back to truncated full-context.
 * Caller passes a SERVICE-ROLE client + the validated chatbot row.
 */
export async function buildKbBlock(opts: {
  supabase: SupabaseClient;
  chatbot: Pick<Chatbot, "id" | "retrieval_active">;
  history: Pick<Message, "role" | "content">[];
  userMessage: string;
}): Promise<KbBlockResult> {
  const { supabase, chatbot } = opts;
  const { data: rows } = await supabase
    .from("knowledge_base")
    .select("id, title, content, indexed")
    .eq("chatbot_id", chatbot.id)
    .order("created_at", { ascending: true });
  const entries = (rows ?? []) as {
    id: string;
    title: string;
    content: string;
    indexed: boolean;
  }[];

  const size = assembledSize(entries);
  const hasUnindexed = entries.some((e) => !e.indexed);
  const mode = decideMode({
    size,
    hasUnindexed,
    embeddingsEnabled: isEmbeddingsEnabled(),
    currentlyActive: chatbot.retrieval_active,
  });

  // Persist the hysteresis flag only when it flips.
  const nowActive = mode === "retrieval";
  if (nowActive !== chatbot.retrieval_active) {
    await supabase.from("chatbots").update({ retrieval_active: nowActive }).eq("id", chatbot.id);
  }

  if (mode === "full") {
    return { block: buildFullContextBlock(entries), mode: "full", chunks: 0, topSimilarity: null };
  }

  try {
    const query = buildQueryString(opts.history, opts.userMessage);
    const vec = await embedQuery(query);
    const { data: matches, error } = await supabase.rpc("match_kb_chunks", {
      p_chatbot_id: chatbot.id,
      // pgvector's `vector` param is cast from its text form '[...]'; passing a
      // raw JS number[] over PostgREST is not reliably coerced, so stringify.
      p_query: JSON.stringify(vec),
      p_top_k: RETRIEVAL_TOP_K,
      p_min_similarity: RETRIEVAL_MIN_SIMILARITY,
      p_model: OPENAI_EMBEDDING_MODEL,
    });
    if (error) throw new Error(error.message);
    const hits = (matches ?? []) as {
      content: string;
      knowledge_base_id: string;
      similarity: number;
    }[];
    if (hits.length === 0) {
      // Nothing relevant cleared the floor → empty block → model defers.
      return { block: "", mode: "retrieval", chunks: 0, topSimilarity: null };
    }
    const titleById = new Map(entries.map((e) => [e.id, e.title]));
    const parts: string[] = [];
    let used = 0;
    for (const h of hits) {
      const piece = `### ${titleById.get(h.knowledge_base_id) ?? "Knowledge"}\n${h.content}`;
      if (parts.length > 0 && used + piece.length > RETRIEVAL_CHAR_BUDGET) break;
      parts.push(piece);
      used += piece.length;
    }
    return {
      block: parts.join("\n\n---\n\n"),
      mode: "retrieval",
      chunks: parts.length,
      topSimilarity: hits[0].similarity,
    };
  } catch (err) {
    console.error("[retrieval] reply-time retrieval failed; full-context fallback", err);
    return { block: buildFullContextBlock(entries), mode: "fallback", chunks: 0, topSimilarity: null };
  }
}
