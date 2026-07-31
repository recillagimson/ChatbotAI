import { Bot, Plus } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { num } from "@/lib/format";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard } from "@/components/ss/card";
import { SsBotMark, SsChip, SsLinkButton } from "@/components/ss/controls";
import { ChannelChip } from "@/components/ss/channel";

export const dynamic = "force-dynamic";

/**
 * The chatbot roster.
 *
 * Each card answers the only question worth asking about a bot from this
 * distance: is it working? So the three numbers on it are volume, how fast it
 * answers, and what's currently broken - and a bot with no connected channel
 * turns amber and asks to be fixed rather than sitting quietly in the grid.
 */
export default async function ChatbotsPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const workspace = await getWorkspace(sp.bot ?? null);
  const bots = workspace?.bots ?? [];

  const { data: rows } = await supabase
    .from("chatbots")
    .select("id, business_description, is_active")
    .eq("user_id", user!.id);
  const descriptions = new Map(
    (rows ?? []).map((r) => [r.id, r.business_description as string | null])
  );

  // Knowledge-entry counts drive the "thin knowledge" warning the design shows
  // on a bot that keeps going off-script.
  // Paged: a workspace with over a thousand knowledge entries would otherwise
  // get a silently truncated count and a false "thin knowledge" warning.
  const { rows: kbRows } = await fetchAllRows<{ chatbot_id: string }>(
    (from, to) =>
      supabase
        .from("knowledge_base")
        .select("chatbot_id")
        .eq("user_id", user!.id)
        .range(from, to),
    { label: "knowledge entry counts" }
  );
  const kbCounts = new Map<string, number>();
  for (const r of kbRows) {
    kbCounts.set(r.chatbot_id, (kbCounts.get(r.chatbot_id) ?? 0) + 1);
  }

  return (
    <PageShell>
      <PageHeader
        title="Chatbots"
        description="One chatbot per business - connect Instagram, Facebook, WhatsApp, Telegram & TikTok through ManyChat."
        actions={
          <SsLinkButton href="/chatbots/new" variant="primary" size="md">
            <Plus className="h-[17px] w-[17px]" aria-hidden="true" />
            New chatbot
          </SsLinkButton>
        }
      />

      <PageBody>
        {bots.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-10 w-10" />}
            title="No chatbots yet"
            action={
              <SsLinkButton href="/chatbots/new" variant="primary" size="md">
                Create your first chatbot
              </SsLinkButton>
            }
          >
            A chatbot holds one business&apos;s voice, offers and knowledge. Create
            it, connect a ManyChat flow, and it starts answering DMs.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {bots.map((b) => {
              const scoped = workspace?.scopedBotId === b.id;
              const kb = kbCounts.get(b.id) ?? 0;
              return (
                <SsCard
                  key={b.id}
                  tone={b.unconnected ? "amber" : "plain"}
                  className={
                    scoped
                      ? "border-[1.5px] border-ss-indigo p-5 shadow-ss-pick"
                      : "p-5"
                  }
                >
                  <div className="flex items-start gap-2.5">
                    <SsBotMark
                      name={b.name}
                      size={34}
                      tone={b.unconnected ? "amber" : "indigo"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold leading-tight text-ss-ink">
                        {b.name}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            b.unconnected
                              ? "bg-ss-amber"
                              : b.is_active
                                ? "bg-ss-green"
                                : "bg-ss-dash"
                          }`}
                        />
                        <span
                          className={`text-[11.5px] font-medium leading-none ${
                            b.unconnected
                              ? "text-ss-amber-ink"
                              : b.is_active
                                ? "text-ss-green-ink"
                                : "text-ss-muted"
                          }`}
                        >
                          {b.unconnected
                            ? "No channel connected"
                            : b.is_active
                              ? "Active · replying now"
                              : "Paused - not replying"}
                        </span>
                      </div>
                    </div>
                    {scoped && <SsChip tone="indigo">Viewing</SsChip>}
                  </div>

                  <p
                    className={`mt-3.5 line-clamp-2 text-[12px] leading-relaxed ${
                      b.unconnected ? "text-ss-amber-ink" : "text-ss-body"
                    }`}
                  >
                    {b.unconnected
                      ? "Replies aren't going out. Connect a ManyChat flow and this bot starts answering."
                      : descriptions.get(b.id)?.trim() ||
                        "No description yet - add one so the AI knows what this business does."}
                  </p>

                  <div
                    className={`mt-4 flex gap-6 border-y py-3.5 ${
                      b.unconnected ? "border-[#f6ecd9]" : "border-ss-hair"
                    }`}
                  >
                    <Metric label="threads" value={num(b.threads)} />
                    <Metric
                      label={b.needsAttention === 1 ? "needs you" : "need you"}
                      value={num(b.needsAttention)}
                      tone={b.needsAttention > 0 ? "rose" : "ink"}
                    />
                    <Metric
                      label={kb === 1 ? "knowledge entry" : "knowledge entries"}
                      value={num(kb)}
                      tone={kb === 0 ? "amber" : "ink"}
                    />
                  </div>

                  <div className="mt-3.5 flex items-center gap-1.5">
                    {b.unconnected ? (
                      <SsChip tone="neutral">None</SsChip>
                    ) : (
                      b.platforms.map((p) => <ChannelChip key={p} platform={p} />)
                    )}
                    <SsLinkButton
                      href={
                        b.unconnected
                          ? `/chatbots/${b.id}?tab=connection`
                          : `/chatbots/${b.id}`
                      }
                      variant={b.unconnected || scoped ? "navy" : "outline"}
                      size="sm"
                      className="ml-auto"
                    >
                      {b.unconnected ? "Connect ManyChat" : "Manage"}
                    </SsLinkButton>
                  </div>
                </SsCard>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "rose" | "amber";
}) {
  const tones = {
    ink: "text-ss-ink",
    rose: "text-ss-rose",
    amber: "text-ss-amber",
  };
  return (
    <div>
      <div className={`ss-num text-base leading-none ${tones[tone]}`}>{value}</div>
      <div className="mt-1.5 text-[10.5px] leading-none text-ss-muted">{label}</div>
    </div>
  );
}
