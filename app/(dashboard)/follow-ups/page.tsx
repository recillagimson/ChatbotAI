import { Suspense } from "react";
import Link from "next/link";
import { Hourglass, SendHorizontal, Timer } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { contactDisplayName } from "@/lib/contact";
import { TAG_LABEL, tagOf } from "@/lib/conversation-tags";
import { toPlatform, PLATFORM_META } from "@/lib/platforms";
import { followupBlocked } from "@/lib/followup";
import {
  CLOSING_SOON_HOURS,
  countWindows,
  leadLastMessageAt,
  MANYCHAT_LIVE_CHAT_URL,
  MAX_REACH_HOURS,
  nativeInboxLabel,
  nativeInboxUrl,
  queueLookbackIso,
  waitingFor,
  windowBucket,
  type WindowConversation,
} from "@/lib/manual-followups";
import { countHandSendsSince, withLeadClock } from "@/lib/lead-activity";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { agoShort, num } from "@/lib/format";
import { Sk, SkCard, SkNavyPanel, SkPills } from "@/components/ss/skeleton";
import { PageBody, PageHeader, PageShell, Callout, EmptyState } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { SsLinkButton, SsPill } from "@/components/ss/controls";
import { NavyPanel, PanelEyebrow } from "@/components/ss/panel";
import { StatCard } from "@/components/ss/stat";
import {
  FollowupCard,
  type FollowupItem,
} from "@/components/dashboard/followup-card";

export const dynamic = "force-dynamic";

// The manual queue (past the 24h window, still hand-reachable for 7 days) split into
// age bands so the coldest leads can be worked first. Hours are since the LEAD's last
// message; the bands partition the whole [24h, 7d) manual window and never surface
// anything past 7 days (that stays "expired" - nothing the app or a hand-send reaches).
const DAY_BANDS = [
  { key: "d1", label: "1 day", loHours: 24, hiHours: 72 },
  { key: "d3", label: "3 days", loHours: 72, hiHours: 120 },
  { key: "d5", label: "5 days", loHours: 120, hiHours: 144 },
  { key: "d7", label: "7 days", loHours: 144, hiHours: 168 },
] as const;
type DayBand = (typeof DAY_BANDS)[number]["key"];

const VIEWS = ["d1", "d3", "d5", "d7", "closing", "reachable"] as const;
type View = (typeof VIEWS)[number];

/**
 * Manual follow-ups - the work queue for threads the bot can't reach but you
 * still can.
 *
 * Instagram and Facebook block automated sends 24 hours after the lead's last
 * message, so every thread past that line silently stops being the bot's
 * problem and becomes yours. This screen is that line made visible: how many
 * are past it, how many are about to cross, and one card per lead with a draft
 * ready to send.
 *
 * The queue spans 24 hours to seven days and nothing else. Under 24 hours the
 * bot has it. Past seven days the HUMAN_AGENT tag expires and no send from this
 * app arrives, so a card there would be a button that fails - the count stays
 * visible in the panel above, but the thread is not listed as work. And every
 * window is measured from the lead's own last message, so answering you takes a
 * thread off this screen while your nudge alone does not.
 *
 * Nothing here is a new database concept - it's the existing conversations and
 * messages tables read through [lib/manual-followups.ts] and
 * [lib/lead-activity.ts].
 */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "d1";
  const windowHours = PLATFORM_META.instagram.standardWindowHours ?? 24;
  const reachDays = Math.round(MAX_REACH_HOURS / 24);

  // Switching view and changing the chatbot scope both only rewrite the query
  // string, so `loading.tsx` never fires for them - this boundary is what makes
  // those clicks show a skeleton instead of freezing on the previous bucket.
  return (
    <PageShell>
      <PageHeader
        title="Manual follow-ups"
        description={`Instagram and Facebook stop accepting automated sends ${windowHours} hours after the lead's last message, and stop accepting yours after ${reachDays} days. Everything in between is here - the leads you can still reach by hand.`}
      />
      <PageBody>
        <Suspense
          key={`${sp.bot ?? ""}|${view}`}
          fallback={<FollowUpsSkeleton />}
        >
          <FollowUpsQueue sp={sp} view={view} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

/** The counters, the window panel and the queue - everything that's fetched. */
async function FollowUpsQueue({
  sp,
  view,
}: {
  sp: { bot?: string; view?: string };
  view: View;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const workspace = await getWorkspace(sp.bot ?? null);
  const botId = workspace?.scopedBotId ?? null;

  // Paged rather than `.limit(2000)`: PostgREST caps a request at 1,000 rows
  // silently, so the limit form quietly worked the oldest thousand threads and
  // called that the queue. On a 2,453-thread account that hid real work AND
  // disagreed with the sidebar badge, which truncated a different slice.
  const { rows: fetched, truncated } = await fetchAllRows<
    WindowConversation & {
      id: string;
      contact_name: string | null;
      contact_username: string | null;
      chatbots: unknown;
    }
  >(
    (from, to) => {
      let q = supabase
        .from("conversations")
        .select(
          "id, contact_name, contact_username, platform, last_message_at, status, confirmed_at, user_muted_at, bot_off_at, tag, chatbot_id, chatbots(name)"
        )
        .eq("user_id", user!.id)
        .order("last_message_at", { ascending: true })
        .range(from, to);
      if (botId) q = q.eq("chatbot_id", botId);
      return q;
    },
    { label: "follow-up queue" }
  );

  const now = Date.now();

  // Re-anchor every thread on the LEAD's last message. Without this a thread you
  // hand-replied to would read as freshly active - `last_message_at` counts your
  // own send - and would drift back into the queue a day later with its
  // seven-day edge pushed out. The lead answering is what clears a thread from
  // this screen; your nudge is not.
  const { rows: all, activity } = await withLeadClock(
    supabase,
    fetched,
    queueLookbackIso(now)
  );

  const counts = countWindows(all, now);

  // The one queue, bucketed. `waiting` is the default because it's the only
  // bucket that costs money when ignored. Longest-waiting first, measured from
  // the lead's clock rather than the order the rows arrived in.
  const byLeadClock = (
    a: (typeof all)[number],
    b: (typeof all)[number]
  ) =>
    new Date(leadLastMessageAt(a)).getTime() -
    new Date(leadLastMessageAt(b)).getTime();

  // The manual queue, longest-waiting first, then split into the day bands. `bandOf`
  // measures from the lead's last message; because bucketOf already returns "manual"
  // only inside [24h, 7d), every manual thread lands in exactly one band.
  const manual = all
    .filter((c) => bucketOf(c, now) === "manual")
    .sort(byLeadClock);
  const bandOf = (c: (typeof all)[number]): DayBand | null => {
    const h = (now - new Date(leadLastMessageAt(c)).getTime()) / (60 * 60 * 1000);
    return DAY_BANDS.find((b) => h >= b.loHours && h < b.hiHours)?.key ?? null;
  };
  const buckets = {
    d1: manual.filter((c) => bandOf(c) === "d1"),
    d3: manual.filter((c) => bandOf(c) === "d3"),
    d5: manual.filter((c) => bandOf(c) === "d5"),
    d7: manual.filter((c) => bandOf(c) === "d7"),
    closing: all.filter((c) => bucketOf(c, now) === "closing").sort(byLeadClock),
    reachable: all.filter((c) => bucketOf(c, now) === "open").sort(byLeadClock),
  };
  const visible = buckets[view];

  // Last inbound message per visible thread, for the quote on each card.
  const ids = visible.slice(0, 25).map((c) => c.id);
  const previews = new Map<string, string>();
  if (ids.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, content, role, created_at")
      .in("conversation_id", ids)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(ids.length * 6);
    for (const m of msgs ?? []) {
      if (!previews.has(m.conversation_id)) {
        previews.set(m.conversation_id, m.content);
      }
    }
  }

  // Human-agent sends made today - the "you did this by hand" counter. Counted
  // from the same scoped read as everything else: filtering messages by role and
  // date alone would count every tenant's manual replies for a superadmin, whose
  // RLS grants the whole table.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const sentToday = countHandSendsSince(activity, dayStart.toISOString());

  const oldest = manual[0] ?? null;

  const items: FollowupItem[] = visible.slice(0, 25).map((c) => {
    const platform = toPlatform(c.platform);
    const leadAt = leadLastMessageAt(c);
    return {
      id: c.id,
      name: contactDisplayName(c.contact_name, c.contact_username),
      platform,
      waiting: waitingFor(leadAt, now),
      tagLabel: TAG_LABEL[tagOf(c.tag)],
      lastMessage: truncate(previews.get(c.id) ?? null, 160),
      lastMessageAt: leadAt,
      botName: null,
      nativeUrl: nativeInboxUrl(platform),
      nativeLabel: nativeInboxLabel(platform),
      manychatUrl: MANYCHAT_LIVE_CHAT_URL,
    };
  });

  const windowHours = PLATFORM_META.instagram.standardWindowHours ?? 24;
  const reachDays = Math.round(MAX_REACH_HOURS / 24);
  const total = counts.open + counts.closing + counts.manual;

  return (
    <>
        {/* ---- The window, drawn ----------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <NavyPanel streaks={false} className="rounded-card px-[22px] py-5">
            <PanelEyebrow icon={<Hourglass className="h-3.5 w-3.5" />}>
              The {windowHours}-hour messaging window
            </PanelEyebrow>

            {/* Three equal thirds, not widths proportional to the counts. The
                bands describe three fixed spans of a thread's life, so sizing
                them by volume made the widest label ("bot replies freely") sit
                in the narrowest band and truncate - the segment carrying the
                most explaining got the least room. The counts are printed
                inside each band and repeated on the pills below. */}
            <div className="mt-[18px] grid h-[52px] grid-cols-3">
              <WindowBand
                tone="green"
                title={
                  <>
                    0 – {windowHours - CLOSING_SOON_HOURS}h
                    <span className="hidden sm:inline"> · bot replies freely</span>
                  </>
                }
                sub={`${num(counts.open)} thread${counts.open === 1 ? "" : "s"}`}
                first
              />
              <WindowBand
                tone="amber"
                title={`${windowHours - CLOSING_SOON_HOURS} – ${windowHours}h`}
                sub={`${num(counts.closing)} closing`}
              />
              <WindowBand
                tone="rose"
                title={
                  <>
                    {windowHours}h – {reachDays}d
                    <span className="hidden sm:inline"> · you only</span>
                  </>
                }
                sub={`${num(counts.manual)} waiting`}
                last
              />
            </div>

            <p className="mt-3.5 max-w-[40rem] text-[12px] leading-relaxed text-ss-nav-text">
              Once a thread crosses {windowHours} hours, anything the bot sends
              bounces - but a reply you send by hand still gets through for{" "}
              {reachDays} days, which is the queue below.{" "}
              {counts.expired > 0 ? (
                <>
                  {num(counts.expired)} thread
                  {counts.expired === 1 ? " has" : "s have"} passed {reachDays}{" "}
                  days: nothing this app sends will arrive, so{" "}
                  {counts.expired === 1 ? "it is" : "they are"} not listed
                  below.
                </>
              ) : (
                <>Nothing has passed {reachDays} days yet.</>
              )}
            </p>
          </NavyPanel>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Waiting"
              value={num(counts.manual)}
              valueTone={counts.manual > 0 ? "rose" : "ink"}
              foot="past the window"
            />
            <StatCard
              label="Closing soon"
              value={num(counts.closing)}
              valueTone={counts.closing > 0 ? "amber" : "ink"}
              foot={`within ${CLOSING_SOON_HOURS}h of the cutoff`}
            />
            <StatCard
              label="Oldest waiting"
              value={oldest ? waitingFor(leadLastMessageAt(oldest), now) : "-"}
              valueTone={oldest ? "rose" : "muted"}
              foot={
                oldest
                  ? `${contactDisplayName(oldest.contact_name, oldest.contact_username)} · ${toPlatform(oldest.platform) === "messenger" ? "FB" : "IG"}`
                  : "nothing overdue"
              }
            />
            <StatCard
              label="Sent by hand"
              value={num(sentToday)}
              foot="today, by you"
            />
          </div>
        </div>

        {/* ---- Closing-soon nudge ---------------------------------------- */}
        {counts.closing > 0 && view !== "closing" && (
          <Callout
            tone="amber"
            icon={<Timer className="h-[18px] w-[18px] text-ss-amber" aria-hidden="true" />}
            actions={
              <SsLinkButton href="/follow-ups?view=closing" variant="amber" size="md">
                See the {counts.closing}
              </SsLinkButton>
            }
          >
            <strong className="font-semibold text-ss-ink">
              {counts.closing} thread{counts.closing === 1 ? "" : "s"} close within{" "}
              {CLOSING_SOON_HOURS} hours.
            </strong>{" "}
            The bot can still reach these automatically - nudge them now and they
            never land in this queue.
          </Callout>
        )}

        {/* ---- Views ------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2">
          {DAY_BANDS.map((b) => (
            <SsPill
              key={b.key}
              href={`/follow-ups?view=${b.key}`}
              active={view === b.key}
              count={buckets[b.key].length}
            >
              {b.label}
            </SsPill>
          ))}
          <SsPill
            href="/follow-ups?view=closing"
            active={view === "closing"}
            count={counts.closing}
          >
            Closing soon
          </SsPill>
          <SsPill
            href="/follow-ups?view=reachable"
            active={view === "reachable"}
            count={counts.open}
          >
            Bot still has these
          </SsPill>
          <span className="ml-auto text-[11.5px] leading-none text-ss-muted">
            Longest waiting first · {num(total)} open thread
            {total === 1 ? "" : "s"} in scope
          </span>
        </div>

        {/* ---- Queue ------------------------------------------------------ */}
        {items.length === 0 ? (
          <EmptyState
            icon={<SendHorizontal className="h-8 w-8" />}
            title={
              view === "closing"
                ? "Nothing is about to close"
                : view === "reachable"
                  ? "No open threads inside the window"
                  : "Nothing waiting in this band"
            }
          >
            {view === "closing"
              ? `No thread is within ${CLOSING_SOON_HOURS} hours of its cutoff right now.`
              : view === "reachable"
                ? "Threads appear here while the bot can still answer them automatically."
                : `No lead has been waiting this long right now - either the bot can still reach them, they've replied and it's back on the bot, or they've passed ${reachDays} days.`}
          </EmptyState>
        ) : view === "reachable" ? (
          // These don't need a human, so they're a list rather than a work
          // queue - showing a "Send as me" button here would invite you to do
          // the bot's job for it.
          <SsCard className="p-[22px]">
            <SsCardHead
              title="The bot still has these"
              description="Inside the window and still being answered automatically. Listed so you can see what's live, not so you can take it over."
            />
            <div className="mt-3.5 flex flex-col gap-1.5">
              {items.map((it) => (
                <Link
                  key={it.id}
                  href={`/conversations/${it.id}`}
                  className="flex items-center gap-3 rounded-chip border border-ss-line px-3.5 py-3 transition-colors hover:border-ss-dash hover:bg-ss-page"
                >
                  <span className="truncate text-[13px] font-semibold leading-none text-ss-ink">
                    {it.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] leading-none text-ss-muted">
                    {it.tagLabel}
                  </span>
                  <span className="ml-auto shrink-0 text-[11.5px] leading-none text-ss-muted">
                    last message {agoShort(it.lastMessageAt)}
                  </span>
                </Link>
              ))}
            </div>
          </SsCard>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map((it) => (
              <FollowupCard key={it.id} item={it} />
            ))}
            {visible.length > items.length && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-panel border border-dashed border-ss-dash bg-ss-page-alt px-5 py-3.5">
                <span className="text-[12.5px] font-semibold leading-none text-ss-indigo-600">
                  {num(visible.length - items.length)} more in this bucket
                </span>
                <span className="ml-auto text-[11.5px] leading-none text-ss-muted">
                  A thread leaves this queue the moment the lead replies, and
                  again for good at {reachDays} days.
                  {truncated ? " Counted from the most recent threads only." : ""}
                </span>
              </div>
            )}
          </div>
        )}
    </>
  );
}

/**
 * Bucket one thread the same way `countWindows` does, so the pill counts and
 * the list they filter can never disagree. `followupBlocked` is the app's own
 * "stop chasing this lead" verdict - reusing it here rather than restating the
 * rule is what keeps the two in step when that rule changes.
 */
function bucketOf(c: WindowConversation, now: number) {
  if (followupBlocked(c)) return "n/a";
  return windowBucket(c, now);
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function WindowBand({
  tone,
  title,
  sub,
  first,
  last,
}: {
  tone: "green" | "amber" | "rose";
  /** A node, not a string: the qualifier after the time range is dropped below
   *  `sm`, where a third of a phone's width can't hold it. */
  title: React.ReactNode;
  sub: string;
  first?: boolean;
  last?: boolean;
}) {
  const tones = {
    green: "bg-ss-mint/20 border-ss-mint/40",
    amber: "bg-ss-amber/25 border-ss-amber/45",
    rose: "bg-ss-rose/25 border-ss-rose/45",
  };
  const titles = {
    green: "text-ss-mint",
    amber: "text-ss-amber-soft",
    rose: "text-ss-rose-soft",
  };
  const subs = {
    green: "text-ss-mint-text",
    amber: "text-ss-amber-text",
    rose: "text-[#f9c6cf]",
  };
  return (
    <div
      className={`flex min-w-0 flex-col justify-center border px-3.5 ${tones[tone]} ${
        first ? "rounded-l-ctl" : ""
      } ${last ? "rounded-r-ctl" : ""}`}
    >
      <div
        className={`truncate font-display text-[12px] font-bold leading-none ${titles[tone]}`}
      >
        {title}
      </div>
      <div className={`mt-1.5 truncate text-[10.5px] leading-none ${subs[tone]}`}>
        {sub}
      </div>
    </div>
  );
}

/**
 * The queue's in-page skeleton, shown while a view pill or the chatbot scope is
 * being applied. Same grid as the real body so the panel and counters don't jump.
 *
 * Note the header no longer carries a "N WAITING" badge: the count it showed is
 * the first stat card directly beneath it, and computing it in the shell would
 * mean doing the queue's whole read before anything could render - which is
 * exactly what this boundary exists to avoid.
 */
function FollowUpsSkeleton() {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkNavyPanel height="h-[196px]" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-card border border-ss-line bg-white px-5 py-[18px]"
            >
              <Sk className="h-[11px] w-20" />
              <Sk className="mt-3 h-[28px] w-14" />
              <Sk className="mt-2.5 h-[11px] w-24" />
            </div>
          ))}
        </div>
      </div>
      <SkPills count={3} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <SkCard key={i} className="px-5 py-[18px]">
            <div className="flex items-start gap-3">
              <Sk className="h-[38px] w-[38px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Sk className="h-[14px] w-32" />
                  <Sk className="h-[18px] w-10 rounded-full" />
                  <Sk className="h-[18px] w-40 rounded-full" />
                </div>
                <Sk className="mt-2.5 h-[46px] w-full rounded-ctl-lg" />
                <Sk className="mt-2.5 h-[86px] w-full rounded-ctl-lg" />
              </div>
            </div>
            <div className="mt-3.5 flex gap-2 border-t border-ss-hair pt-3.5">
              <Sk className="h-[38px] w-32 rounded-ctl-lg" />
              <Sk className="h-[38px] w-28 rounded-ctl-lg" />
              <Sk className="h-[38px] w-36 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </>
  );
}
