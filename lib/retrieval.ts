// lib/retrieval.ts
import { KB_CHAR_BUDGET, RETRIEVAL_CUTOVER, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS } from "./kb-config";

export type KbEntryLite = { title: string; content: string };

const SEP = "\n\n---\n\n";
const NO_KB =
  "(No knowledge base entries yet - answer only based on the business description and politely defer if asked something you cannot confirm.)";

/** True when a KB block carries NO real knowledge - either blank (retrieval matched
 *  nothing above the floor) or the NO_KB sentinel (the bot has no entries at all).
 *  Lets callers (e.g. the trainer diagnostics) honestly tell an owner "the model
 *  got no knowledge base for this message" instead of inferring it from char count
 *  (the sentinel is ~135 non-empty chars and would otherwise look like real KB). */
export function isEmptyKbBlock(block: string): boolean {
  const t = block.trim();
  return t === "" || t === NO_KB;
}

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

/**
 * Opt-in hard cap on a single oversized FIRST entry. Read at CALL time so it can be
 * flipped per environment (and toggled in a test) without a rebuild.
 *
 * DEFAULT OFF, deliberately. Entries are fetched oldest-first and decideMode returns
 * "full" whenever embeddings are off or anything is unindexed, so for any bot whose
 * OLDEST kb entry is one big pasted document (the UI allows 100k chars in a single
 * field) turning this on removes tens of thousands of chars of knowledge that reached
 * the model yesterday. That is a real content change for live bots, not a bug fix, so
 * it does not ride along with an unrelated rollout: check the actual per-entry sizes
 * for the bots you serve, then set KB_HARD_TRUNCATE_ENTRIES=true. With it off the
 * emitted block is byte-identical to the long-standing behaviour; the console.warn
 * below fires either way, so the situation is diagnosable before anyone flips it.
 */
export function kbHardTruncateEnabled(): boolean {
  return process.env.KB_HARD_TRUNCATE_ENTRIES === "true";
}

/** Full-context KB block, truncated at KB_CHAR_BUDGET (moved from anthropic.ts). */
export function buildFullContextBlock(entries: KbEntryLite[]): string {
  if (entries.length === 0) return NO_KB;
  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  let oversizedFirst = false;
  for (const e of entries) {
    const t = entryText(e);
    if (used + t.length > KB_CHAR_BUDGET) {
      // The FIRST entry bypasses the cap: one pasted 100k-char document (the
      // per-entry write ceiling) is injected whole rather than cut mid-sentence,
      // because for a single-document KB that cut silently deletes most of the
      // bot's knowledge. KB_HARD_TRUNCATE_ENTRIES=true opts into bounding it.
      if (parts.length === 0) {
        oversizedFirst = true;
        if (kbHardTruncateEnabled()) {
          parts.push(t.slice(0, KB_CHAR_BUDGET));
          used = KB_CHAR_BUDGET;
        } else {
          parts.push(t);
          used += t.length;
          continue; // keep packing; later entries still respect the budget
        }
      }
      truncated = true;
      break;
    }
    parts.push(t);
    used += t.length;
  }
  let block = parts.join(SEP);
  if (truncated) {
    block += `${SEP}…(knowledge base truncated - some entries were omitted to stay within limits)`;
  }
  // The only owner-visible signal today is a line of text addressed to the MODEL.
  // Log the real numbers so "my bot forgot the thing I added last" is diagnosable -
  // including the over-budget-but-untruncated case, which emits no notice at all.
  if (truncated || oversizedFirst) {
    console.warn(
      "[retrieval] KB over budget: %d of %d chars reaching the model (%d of %d entries)%s",
      used,
      assembledSize(entries),
      parts.length,
      entries.length,
      oversizedFirst
        ? kbHardTruncateEnabled()
          ? " (first entry hard-truncated)"
          : " (first entry exceeds the budget on its own and was passed through whole)"
        : ""
    );
  }
  return block;
}

/**
 * Pick reply mode. Hysteresis: engage retrieval above RETRIEVAL_CUTOVER, but
 * once active stay in retrieval until size drops back below KB_CHAR_BUDGET.
 * Safety: no key or any unindexed entry → full-context (this always wins, so
 * forceRetrieval on an un-reindexed bot still serves full-context — never an
 * empty KB). forceRetrieval (admin per-bot flag) then engages retrieval
 * regardless of size, to cut per-reply tokens on small-but-heavily-used KBs.
 */
export function decideMode(opts: {
  size: number;
  hasUnindexed: boolean;
  embeddingsEnabled: boolean;
  currentlyActive: boolean;
  forceRetrieval?: boolean;
}): "full" | "retrieval" {
  if (!opts.embeddingsEnabled || opts.hasUnindexed) return "full";
  if (opts.forceRetrieval) return "retrieval";
  if (opts.currentlyActive) return opts.size > KB_CHAR_BUDGET ? "retrieval" : "full";
  return opts.size > RETRIEVAL_CUTOVER ? "retrieval" : "full";
}

/**
 * Build the retrieval query from the last turns + current message.
 *
 * The CURRENT message is budgeted first and the history tail is truncated from its
 * end. The old version appended userMessage last and sliced from the front, so a
 * single prior message carrying extracted document text (up to MAX_DOC_CHARS = 20k,
 * see lib/inbound-media.ts) ate the whole 4000-char budget and the live question was
 * cut out completely - the embedding was of the attachment, not of what they asked.
 * Invisible in logs: mode=retrieval, chunks>0, topSimilarity looks healthy.
 */
export function buildQueryString(
  history: { role: string; content: string }[],
  userMessage: string
): string {
  const cur = userMessage.slice(0, 2000);
  const room = Math.max(0, 4000 - cur.length - 1);
  const tail = history.slice(-2).map((m) => m.content).join("\n");
  if (room === 0 || !tail) return cur;
  return `${tail.slice(-room)}\n${cur}`;
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

  // Flip the flag DOWN before touching the chunks. The embed call below can take long
  // enough to be killed by the calling route's maxDuration, and if that happens after
  // the delete the entry would be left indexed=true with zero chunks - permanently
  // invisible to retrieval, with hasUnindexed false so decideMode never falls back to
  // full-context to compensate. Failing this way round leaves indexed=false, which
  // decideMode already treats as "serve full-context". Degrades in the safe direction.
  await supabase.from("knowledge_base").update({ indexed: false }).eq("id", entry.id);

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

interface KbHit {
  content: string;
  knowledge_base_id: string;
  similarity: number;
}

/** Pack retrieved chunks into a KB block, bounded by RETRIEVAL_CHAR_BUDGET. Shared by
 *  the normal path and the zero-hit relaxed pass so the two can never drift. */
function packHits(
  hits: KbHit[],
  titleById: Map<string, string>
): { block: string; count: number } {
  const parts: string[] = [];
  let used = 0;
  for (const h of hits) {
    const piece = `### ${titleById.get(h.knowledge_base_id) ?? "Knowledge"}\n${h.content}`;
    if (parts.length > 0 && used + piece.length > RETRIEVAL_CHAR_BUDGET) break;
    parts.push(piece);
    used += piece.length;
  }
  return { block: parts.join("\n\n---\n\n"), count: parts.length };
}

/**
 * Reply-time KB resolver. Fetches the chatbot's entries, picks a mode (with
 * hysteresis persisted on chatbots.retrieval_active), and returns a pre-built
 * KB-block string. Retrieval errors/timeouts fall back to truncated full-context.
 * Caller passes a SERVICE-ROLE client + the validated chatbot row.
 */
export async function buildKbBlock(opts: {
  supabase: SupabaseClient;
  chatbot: Pick<Chatbot, "id" | "retrieval_active" | "force_retrieval">;
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
    forceRetrieval: chatbot.force_retrieval,
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
    const hits = (matches ?? []) as KbHit[];
    const titleById = new Map(entries.map((e) => [e.id, e.title]));
    if (hits.length === 0) {
      // Zero hits is a property of the QUERY, not of the KB: a 2-4 char opener ("ok",
      // "hi", a bare trigger word) embeds to a low-information vector that clears the
      // floor against nothing, and that is equally true at 45k or 165k chars. The old
      // branch keyed the safety fallback off force_retrieval - an admin token-cost
      // lever - and otherwise returned "", which lands in the prompt as a bare
      // "KNOWLEDGE BASE" heading with nothing under it, immediately followed by "never
      // invent facts beyond this". That is exactly the turn a scripted flow opens on.
      //
      // 1) Relaxed second pass on the SAME vector (no new embedding call): no
      //    similarity floor, top 3, still bounded by RETRIEVAL_CHAR_BUDGET.
      const { data: relaxed } = await supabase.rpc("match_kb_chunks", {
        p_chatbot_id: chatbot.id,
        p_query: JSON.stringify(vec),
        p_top_k: 3,
        p_min_similarity: 0,
        p_model: OPENAI_EMBEDDING_MODEL,
      });
      const relaxedHits = (relaxed ?? []) as KbHit[];
      if (relaxedHits.length > 0) {
        const packed = packHits(relaxedHits, titleById);
        return {
          block: packed.block,
          mode: "retrieval",
          chunks: packed.count,
          topSimilarity: relaxedHits[0].similarity,
        };
      }
      // 2) Genuinely nothing matched at any threshold (e.g. an OPENAI_EMBEDDING_MODEL
      //    change orphaned every chunk). force_retrieval keeps its full-context
      //    fallback; everyone else gets the honest NO_KB sentinel, so isEmptyKbBlock
      //    stays true and the model is told to politely defer instead of being handed
      //    an empty heading. `block: ""` is no longer reachable on any path.
      if (chatbot.force_retrieval) {
        return { block: buildFullContextBlock(entries), mode: "fallback", chunks: 0, topSimilarity: null };
      }
      return { block: NO_KB, mode: "retrieval", chunks: 0, topSimilarity: null };
    }
    const packed = packHits(hits, titleById);
    return {
      block: packed.block,
      mode: "retrieval",
      chunks: packed.count,
      topSimilarity: hits[0].similarity,
    };
  } catch (err) {
    console.error("[retrieval] reply-time retrieval failed; full-context fallback", err);
    return { block: buildFullContextBlock(entries), mode: "fallback", chunks: 0, topSimilarity: null };
  }
}
