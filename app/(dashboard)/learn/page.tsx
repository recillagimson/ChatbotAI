import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Flag,
  Headset,
  HelpCircle,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspace";
import { Sk, SkPills } from "@/components/ss/skeleton";
import { getAnalyticsOverview, resolveRange } from "@/lib/analytics";
import {
  LEARN_CATEGORIES,
  LESSONS,
  pathMinutes,
  recommendedPath,
  type LearnCategory,
  type LearnSignals,
  type Lesson,
} from "@/lib/learn";
import { SUPPORT_CONTACTS } from "@/lib/support-contacts";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsCard, SsCardHead, SsCardLink } from "@/components/ss/card";
import { SsChip, SsLinkButton, SsPill } from "@/components/ss/controls";
import { NavyPanel, PanelEyebrow } from "@/components/ss/panel";

export const dynamic = "force-dynamic";

/**
 * Learn - a short setup path first, then the library.
 *
 * The path isn't a fixed curriculum. Each lesson declares what it fixes, checks
 * that against this workspace's real numbers, and only joins the path when it
 * has something to say. So a bot with no knowledge entries and 181 failed sends
 * gets a different first lesson than a healthy one, and every card can name the
 * number it moves.
 */
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string; category?: string }>;
}) {
  const sp = await searchParams;

  // The "start here" path is computed from live workspace numbers, and the
  // category pills filter the library - both only change the query string.
  return (
    <PageShell>
      <PageHeader
        title="Learn"
        description="Short lessons, each tied to a number in your dashboard."
        actions={
          <SsLinkButton
            href={`tel:${SUPPORT_CONTACTS[0]?.tel ?? ""}`}
            variant="outline"
            size="md"
          >
            <Headset className="h-4 w-4" aria-hidden="true" />
            Book a walkthrough
          </SsLinkButton>
        }
      />

      <PageBody>
        <Suspense
          key={`${sp.bot ?? ""}|${sp.category ?? ""}`}
          fallback={<LearnSkeleton />}
        >
          <LearnBody sp={sp} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

/** The computed path and the lesson library - everything that needs a read. */
async function LearnBody({ sp }: { sp: { bot?: string; category?: string } }) {
  const category = LEARN_CATEGORIES.includes(sp.category as LearnCategory)
    ? (sp.category as LearnCategory)
    : null;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const workspace = await getWorkspace(sp.bot ?? null);
  const botId = workspace?.scopedBotId ?? null;

  const month = resolveRange({ range: "30d" });
  const [stats, { count: kbEntries }, { data: bots }] = await Promise.all([
    getAnalyticsOverview(supabase, {
      from: month.from,
      to: month.to,
      chatbotId: botId,
    }),
    supabase
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id),
    supabase
      .from("chatbots")
      .select("keyword_triggers, auto_followup_enabled, manychat_api_key_enc")
      .eq("user_id", user!.id),
  ]);

  const signals: LearnSignals = {
    kbEntries: kbEntries ?? 0,
    deliveryFailures: stats.overview?.usage.delivery_failures ?? 0,
    manualFollowups: workspace?.counts.followups ?? 0,
    needsAttention: workspace?.counts.needsAttention ?? 0,
    hasKeywords: (bots ?? []).some(
      (b) => Array.isArray(b.keyword_triggers) && b.keyword_triggers.length > 0
    ),
    followupsOn: (bots ?? []).some((b) => b.auto_followup_enabled === true),
    connected: (bots ?? []).some((b) => !!b.manychat_api_key_enc),
    chatbots: workspace?.counts.chatbots ?? 0,
  };

  const path = recommendedPath(signals);
  const totalMinutes = pathMinutes(path);
  const library = category
    ? LESSONS.filter((l) => l.category === category)
    : LESSONS;

  return (
    <>
        {/* ---- Start here ------------------------------------------------ */}
        <NavyPanel
          streaks={false}
          className="flex flex-col overflow-hidden lg:flex-row"
        >
          <div className="flex-1 px-[26px] py-6">
            <PanelEyebrow icon={<Flag className="h-3.5 w-3.5" />}>
              Start here · {totalMinutes} min of reading
            </PanelEyebrow>
            <h2 className="mt-3 max-w-[26rem] font-display text-2xl font-bold leading-tight tracking-[-0.01em] text-white">
              {signals.connected
                ? "Get your bot from answering to booking"
                : "Get your bot live and answering"}
            </h2>
            <p className="mt-2.5 max-w-[28rem] text-[13px] leading-relaxed text-ss-nav-text">
              {path.length} lessons in the order they&apos;ll help you most,
              picked from what your dashboard shows right now.
            </p>
            <div className="mt-5">
              <SsLinkButton
                href={`/learn/${path[0]?.lesson.slug ?? LESSONS[0].slug}`}
                variant="primary"
                size="lg"
              >
                <BookOpen className="h-[18px] w-[18px]" aria-hidden="true" />
                Start lesson 1
              </SsLinkButton>
            </div>
          </div>

          <div className="flex flex-none flex-col gap-[7px] border-t border-white/10 bg-white/5 p-5 lg:w-[392px] lg:border-l lg:border-t-0">
            {path.map(({ lesson, reason }, i) => (
              <Link
                key={lesson.slug}
                href={`/learn/${lesson.slug}`}
                className={`flex items-center gap-3 rounded-ctl-lg px-3.5 py-3 transition-colors ${
                  i === 0
                    ? "bg-ss-indigo hover:bg-ss-indigo-600"
                    : "border border-white/10 hover:bg-white/10"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-display text-[10px] font-bold leading-none ${
                    i === 0
                      ? "bg-white/20 text-white"
                      : "border-[1.5px] border-white/25 text-ss-nav-meta"
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold leading-snug text-white">
                    {lesson.title}
                  </span>
                  <span
                    className={`mt-1 block truncate text-[10.5px] leading-none ${
                      i === 0 ? "text-ss-indigo-100" : "text-ss-nav-meta"
                    }`}
                  >
                    {lesson.minutes} min read · {reason.toLowerCase()}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </NavyPanel>

        {/* ---- Library --------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <SsPill href="/learn" active={!category} tone="navy" count={LESSONS.length}>
            All lessons
          </SsPill>
          {LEARN_CATEGORIES.map((c) => (
            <SsPill
              key={c}
              href={`/learn?category=${encodeURIComponent(c)}`}
              active={category === c}
            >
              {c}
            </SsPill>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {library.map((lesson) => (
            <LessonCard key={lesson.slug} lesson={lesson} signals={signals} />
          ))}
        </div>

        {/* ---- Quick answers + a human ----------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-2">
          <SsCard className="p-[22px]">
            <SsCardHead title="Quick answers" />
            <div className="mt-3 flex flex-col">
              {QUICK_ANSWERS.map((q, i) => (
                <Link
                  key={q.slug}
                  href={`/learn/${q.slug}`}
                  className="group flex items-center gap-2.5 border-ss-hair-2 py-3 first:pt-0"
                  style={i > 0 ? { borderTopWidth: 1 } : undefined}
                >
                  <HelpCircle
                    className="h-[17px] w-[17px] shrink-0 text-ss-muted"
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-[12.5px] font-medium leading-snug text-ss-ink group-hover:text-ss-indigo-600">
                    {q.q}
                  </span>
                  <span className="shrink-0 text-ss-fainter" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </SsCard>

          <SsCard tone="indigo" className="flex flex-wrap items-center gap-4 p-[22px]">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-panel bg-ss-indigo">
              <Headset className="h-6 w-6 text-white" aria-hidden="true" />
            </span>
            <div className="min-w-[14rem] flex-1">
              <div className="font-display text-[15px] font-bold leading-tight text-ss-ink">
                Rather have someone walk you through it?
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ss-body">
                Call or text{" "}
                {SUPPORT_CONTACTS.map((c) => `@${c.name}`).join(" or ")} and
                they&apos;ll set the next change up with you live.
              </p>
            </div>
            <div className="ml-auto flex flex-col gap-1.5">
              {SUPPORT_CONTACTS.map((c) => (
                <a
                  key={c.tel}
                  href={`tel:${c.tel}`}
                  className="whitespace-nowrap rounded-[10px] bg-ss-navy px-4 py-2.5 text-center text-[12.5px] font-bold leading-none text-white transition-colors hover:bg-ss-navy-700"
                >
                  {c.phone}
                </a>
              ))}
            </div>
          </SsCard>
        </div>
    </>
  );
}

function LessonCard({
  lesson,
  signals,
}: {
  lesson: Lesson;
  signals: LearnSignals;
}) {
  const reason = lesson.signal(signals);
  return (
    <Link
      href={`/learn/${lesson.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-ss-line bg-white transition-shadow hover:shadow-ss-plan"
    >
      <div
        className="relative flex h-[112px] items-center justify-center"
        style={{
          background: `linear-gradient(128deg, ${lesson.gradient[0]}, ${lesson.gradient[1]})`,
        }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
          <BookOpen className="h-[22px] w-[22px] text-white" aria-hidden="true" />
        </span>
        <span className="absolute left-3 top-2.5 rounded-[6px] bg-white/20 px-2 py-[3px] text-[9.5px] font-bold uppercase leading-[1.6] tracking-wide text-white">
          {lesson.category}
        </span>
        <span className="absolute bottom-2.5 right-3 rounded-[6px] bg-[#0f0d2d]/60 px-2 py-[3px] text-[10.5px] font-semibold leading-[1.5] text-white">
          {lesson.minutes} min read
        </span>
      </div>

      <div className="flex flex-1 flex-col px-[18px] py-4">
        <div className="font-display text-[14.5px] font-bold leading-snug text-ss-ink">
          {lesson.title}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ss-muted">
          {lesson.summary}
        </p>
        <div className="mt-auto flex items-center gap-2 border-t border-ss-hair pt-3 [margin-top:13px]">
          {reason ? (
            <SsChip tone="rose-soft" className="normal-case">
              {reason}
            </SsChip>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium leading-none text-ss-muted">
              <CheckCircle2 className="h-3.5 w-3.5 text-ss-green" aria-hidden="true" />
              Nothing to fix here
            </span>
          )}
          <span className="ml-auto text-[11.5px] font-semibold leading-none text-ss-indigo-600">
            Read
          </span>
        </div>
      </div>
    </Link>
  );
}

const QUICK_ANSWERS = [
  {
    q: "Why did my bot answer something I never wrote?",
    slug: "knowledge-entries-that-land",
  },
  {
    q: "How do I take over a chat without confusing the lead?",
    slug: "take-over-a-chat",
  },
  { q: "What counts as a lead versus bot or spam?", slug: "tags-and-quality" },
  {
    q: "Why do some replies never reach the lead?",
    slug: "beat-the-24-hour-window",
  },
];

/** The navy path panel, the category pills and the lesson grid. */
function LearnSkeleton() {
  return (
    <>
      <div className="grid overflow-hidden rounded-card bg-ss-navy xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="px-7 py-6">
          <Sk className="h-[11px] w-40" tone="on-navy" />
          <Sk className="mt-3.5 h-[30px] w-72" tone="on-navy" />
          <Sk className="mt-3 h-[12px] w-full max-w-[24rem]" tone="on-navy" />
          <Sk className="mt-5 h-[40px] w-36 rounded-ctl-lg" tone="on-navy" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Sk key={i} className="h-[58px] w-full rounded-chip" tone="on-navy" />
          ))}
        </div>
      </div>
      <SkPills count={5} />
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-card border border-ss-line bg-white">
            <Sk className="h-[112px] w-full rounded-none" />
            <div className="px-[18px] py-4">
              <Sk className="h-[14px] w-48" />
              <Sk className="mt-2.5 h-[12px] w-full" />
              <Sk className="mt-2 h-[12px] w-3/4" />
              <div className="mt-4 flex items-center gap-2 border-t border-ss-hair pt-3">
                <Sk className="h-[18px] w-32 rounded-full" />
                <Sk className="ml-auto h-[12px] w-10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
