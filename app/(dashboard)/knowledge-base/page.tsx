import { BookOpen } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspace";
import { Sk, SkCard, SkCardHead } from "@/components/ss/skeleton";
import { KnowledgeBaseManager } from "@/components/dashboard/kb-manager";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard } from "@/components/ss/card";
import { SsLinkButton } from "@/components/ss/controls";
import { num } from "@/lib/format";
import { KB_PREVIEW_CHARS, KB_LIST_MAX_ENTRIES } from "@/lib/kb-config";

export const dynamic = "force-dynamic";

/** Entries at which a bot stops going off-script often. Drives the meter. */
const HEALTHY_ENTRIES = 6;

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const sp = await searchParams;
  const workspace = await getWorkspace(sp.bot ?? null);
  const botId = workspace?.scopedBotId ?? null;

  // Scoping to a different chatbot only changes `?bot=`, so this boundary is
  // what puts a skeleton on that click.
  return (
    <PageShell>
      <PageHeader
        title="Knowledge Base"
        description="Everything the AI is allowed to say about your business."
        actions={
          botId ? <RetrainBotButton chatbotId={botId} variant="navy" size="md" /> : null
        }
      />

      <PageBody>
        <Suspense key={sp.bot ?? "all"} fallback={<KnowledgeBaseSkeleton />}>
          <KnowledgeBaseBody sp={sp} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

/** The entries, the coverage meter and the add box - everything that's read. */
async function KnowledgeBaseBody({ sp }: { sp: { bot?: string } }) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const workspace = await getWorkspace(sp.bot ?? null);
  const botId = workspace?.scopedBotId ?? null;

  const [{ data: chatbots }, { data: kbRows }] = await Promise.all([
    supabase
      .from("chatbots")
      .select("id, name")
      .eq("user_id", user!.id)
      .order("created_at"),
    supabase
      .from("knowledge_base")
      .select(
        "id, chatbot_id, title, source_type, indexed, needs_review, created_at, content, chatbots(name)"
      )
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(KB_LIST_MAX_ENTRIES),
  ]);

  // Trim the bodies HERE rather than in the query: PostgREST's select syntax has
  // no `left(content, n)` - it supports aliases and casts, not arbitrary SQL
  // functions - so a server-side trim would need a generated column plus a schema
  // reload. The Postgres -> server hop still carries the full text, but that is
  // intra-region (functions syd1, project ap-southeast-2). What this removes is
  // the BROWSER payload, which carried every entry's whole body twice per load,
  // once in the SSR HTML and once again in the RSC flight payload, bounded by
  // nothing but MAX_KB_CHARS_PER_CHATBOT. The editor fetches the real text
  // per-entry from GET /api/knowledge-base/[id].
  //
  // The `chatbots(name)` embed is a to-one object at runtime, but the untyped
  // client infers an ARRAY for it, so normalize defensively - same treatment as
  // app/(admin)/admin/clients/[id]/page.tsx:195-204. This only became visible
  // once the select stopped being `*`, which had collapsed the whole row to `any`.
  const all = ((kbRows ?? []) as unknown as Array<{
    id: string;
    chatbot_id: string;
    title: string;
    content: string | null;
    source_type: string;
    created_at: string;
    indexed?: boolean;
    needs_review?: boolean;
    chatbots: { name: string } | { name: string }[] | null;
  }>).map(({ content, chatbots, ...rest }) => ({
    ...rest,
    chatbots: Array.isArray(chatbots) ? chatbots[0] ?? null : chatbots,
    content_preview: (content ?? "").slice(0, KB_PREVIEW_CHARS),
  }));
  const scoped = botId ? all.filter((e) => e.chatbot_id === botId) : all;
  const indexed = scoped.filter((e) => e.indexed === true).length;

  // Coverage is measured against the scoped bot, or the thinnest bot when
  // you're looking at the whole workspace - the weakest bot is the one that
  // actually goes off-script, so averaging would hide it.
  const perBot = (chatbots ?? []).map((c) => ({
    ...c,
    count: all.filter((e) => e.chatbot_id === c.id).length,
  }));
  const focus = botId
    ? perBot.find((b) => b.id === botId)
    : perBot.slice().sort((a, b) => a.count - b.count)[0];
  const coverage = focus?.count ?? 0;

  return (
    <>
        {!chatbots?.length ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="Create a chatbot first"
            action={
              <SsLinkButton href="/chatbots/new" variant="primary" size="md">
                Create a chatbot
              </SsLinkButton>
            }
          >
            Knowledge entries belong to a specific chatbot, so there needs to be
            one before you can teach it anything.
          </EmptyState>
        ) : (
          <>
            {/* ---- Coverage meter ------------------------------------- */}
            <SsCard className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
              <div className="shrink-0">
                <div className="ss-eyebrow text-ss-muted">Coverage</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span
                    className={`font-display text-[22px] font-bold leading-none ${
                      coverage === 0
                        ? "text-ss-rose"
                        : coverage < HEALTHY_ENTRIES
                          ? "text-ss-amber"
                          : "text-ss-green"
                    }`}
                  >
                    {coverage === 0 ? "Empty" : coverage < HEALTHY_ENTRIES ? "Thin" : "Good"}
                  </span>
                  <span className="text-[11.5px] font-medium leading-none text-ss-muted">
                    {num(coverage)} {coverage === 1 ? "entry" : "entries"}
                    {focus && !botId ? ` on ${focus.name}` : ""}
                  </span>
                </div>
              </div>

              <div
                className="flex h-2.5 max-w-[420px] flex-1 gap-1"
                aria-hidden="true"
              >
                {Array.from({ length: HEALTHY_ENTRIES }, (_, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-full ${
                      i < coverage
                        ? i < 2
                          ? "bg-ss-indigo"
                          : "bg-ss-indigo-200"
                        : "bg-ss-line"
                    }`}
                  />
                ))}
              </div>

              <p className="max-w-[19rem] text-[12px] leading-relaxed text-ss-muted">
                Bots with {HEALTHY_ENTRIES}+ entries go off-script roughly a
                third as often.
              </p>

              <span className="ml-auto shrink-0 text-[11.5px] font-medium leading-none text-ss-faint">
                {num(indexed)} of {num(scoped.length)} indexed
              </span>
            </SsCard>

            <KnowledgeBaseManager chatbots={chatbots} entries={all} />
          </>
        )}
    </>
  );
}

/** Matches the coverage strip, the add box and the entry list. */
function KnowledgeBaseSkeleton() {
  return (
    <>
      <SkCard className="px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <Sk className="h-[11px] w-20" />
            <Sk className="mt-2.5 h-[18px] w-40" />
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Sk key={i} className="h-[7px] w-[52px] rounded-full" />
            ))}
          </div>
          <Sk className="ml-auto h-[12px] w-28" />
        </div>
      </SkCard>
      <SkCard>
        <SkCardHead />
        <Sk className="mt-4 h-[42px] w-full rounded-ctl-lg" />
        <Sk className="mt-3.5 h-[38px] w-32 rounded-ctl-lg" />
      </SkCard>
      <SkCard>
        <SkCardHead width="w-36" />
        <Sk className="mt-4 h-[120px] w-full rounded-ctl-lg" />
        <Sk className="mt-3.5 h-[40px] w-36 rounded-ctl-lg" />
      </SkCard>
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <SkCard key={i} className="px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sk className="h-[13px] w-56" />
                <Sk className="mt-2.5 h-[11px] w-32" />
              </div>
              <Sk className="h-[32px] w-20 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </>
  );
}
