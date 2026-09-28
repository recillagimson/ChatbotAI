import { createClient } from "@/lib/supabase/server";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { KnowledgeBaseForm } from "@/components/dashboard/kb-form";
import { KnowledgeBaseList } from "@/components/dashboard/kb-list";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import { KB_CHAR_BUDGET, KB_LIST_MAX_ENTRIES, KB_PREVIEW_CHARS } from "@/lib/kb-config";
import { isEmbeddingsEnabled } from "@/lib/embeddings";
import { kbHealth, type KbHealth } from "@/lib/kb-health";
import { num } from "@/lib/format";
import type { Chatbot } from "@/lib/types";

/**
 * The bot's knowledge, as the last section of its Prompt tab. It used to be the
 * separate /knowledge-base page with its own chatbot picker; knowledge belongs to
 * exactly one bot, so it now sits beside that bot's prompt and needs no picker.
 *
 * Server component: it reads the entries, trims each body to a preview (the
 * browser never receives whole bodies; the editor fetches one on demand), and
 * reports size and read mode from the same functions the reply path uses.
 */
export async function KnowledgeSection({
  chatbot,
}: {
  chatbot: Pick<Chatbot, "id" | "retrieval_active" | "force_retrieval">;
}) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("knowledge_base")
    .select("id, title, source_type, indexed, needs_review, created_at, content")
    .eq("chatbot_id", chatbot.id)
    .order("created_at", { ascending: false })
    .limit(KB_LIST_MAX_ENTRIES);

  const raw = (rows ?? []) as Array<{
    id: string;
    title: string;
    content: string | null;
    source_type: string;
    created_at: string;
    indexed: boolean | null;
    needs_review: boolean | null;
  }>;

  const health = kbHealth({
    entries: raw.map((e) => ({
      title: e.title,
      content: e.content ?? "",
      indexed: e.indexed === true,
      needs_review: e.needs_review === true,
    })),
    embeddingsEnabled: isEmbeddingsEnabled(),
    retrievalActive: chatbot.retrieval_active === true,
    forceRetrieval: chatbot.force_retrieval === true,
  });

  // One bot's list, so the per-entry bot name is noise: pass none.
  const entries = raw.map(({ content, indexed, needs_review, ...rest }) => ({
    ...rest,
    indexed: indexed === true,
    needs_review: needs_review === true,
    chatbots: null,
    content_preview: (content ?? "").slice(0, KB_PREVIEW_CHARS),
  }));

  return (
    <SsCard id="knowledge" className="scroll-mt-4 p-[22px]">
      <SsCardHead
        titleAs="h2"
        title="Knowledge"
        description="The facts the bot can state: prices, policies, programs and FAQs. You edit these directly, and the bot uses each change from its next reply."
        action={<RetrainBotButton chatbotId={chatbot.id} variant="outline" size="sm" />}
        className="mb-4"
      />

      <KnowledgeSummary health={health} />

      <div className="mt-5">
        <KnowledgeBaseForm chatbotId={chatbot.id} />
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[14px] font-bold leading-none text-ss-ink">
            On file
          </h3>
          <span className="text-[11.5px] font-medium leading-none text-ss-muted">
            {num(health.entries)} {health.entries === 1 ? "entry" : "entries"}
          </span>
        </div>
        <KnowledgeBaseList entries={entries} />
      </div>
    </SsCard>
  );
}

/** Size, how each reply reads it, and anything that needs a look. */
function KnowledgeSummary({ health }: { health: KbHealth }) {
  const notes: { text: string; tone: "muted" | "amber" }[] = [];

  if (health.mode === "none") {
    notes.push({
      text: "Nothing on file yet. Until you add something, the bot has no facts to cite and will guess.",
      tone: "amber",
    });
  } else {
    notes.push({
      text:
        health.mode === "search"
          ? "Searched on every reply: the bot pulls the passages closest to what the lead asked."
          : "Read in full on every reply.",
      tone: "muted",
    });
  }

  if (health.overBudget) {
    notes.push({
      text:
        health.entries === 1
          ? `Larger than the ${num(KB_CHAR_BUDGET)}-character budget for one reply. The bot still reads all of it, but every reply costs more.`
          : `Larger than the ${num(KB_CHAR_BUDGET)}-character budget for one reply, so the newest entries may be left out.`,
      tone: "amber",
    });
  }

  if (health.unindexed > 0) {
    notes.push({
      text: `${num(health.unindexed)} of ${num(health.entries)} ${
        health.entries === 1 ? "entry is" : "entries are"
      } not indexed yet, so the bot reads everything in full. Retrain bot to index ${
        health.unindexed === 1 ? "it" : "them"
      }.`,
      tone: "muted",
    });
  }

  if (health.needsReview > 0) {
    notes.push({
      text: `${num(health.needsReview)} ${
        health.needsReview === 1 ? "upload" : "uploads"
      } came out with very little text (often a scanned PDF). Open ${
        health.needsReview === 1 ? "it" : "them"
      } below and check the text.`,
      tone: "amber",
    });
  }

  return (
    <div className="rounded-chip bg-ss-page px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-[15px] font-bold leading-none text-ss-ink">
          {num(health.chars)} characters
        </span>
        {health.chars > 0 && (
          <span className="text-[11.5px] font-medium leading-none text-ss-muted">
            about {num(health.approxTokens)} tokens
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {notes.map((n) => (
          <li
            key={n.text}
            className={`text-[12px] leading-relaxed ${
              n.tone === "amber" ? "text-ss-amber-ink" : "text-ss-body"
            }`}
          >
            {n.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
