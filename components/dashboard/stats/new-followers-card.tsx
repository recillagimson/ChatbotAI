import { Fragment } from "react";
import Link from "next/link";
import { MessageCircle, PauseCircle, UserPlus } from "lucide-react";
import { SsCard, SsCardHead, SsIconTile } from "@/components/ss/card";
import { SsAvatar, SsLinkButton } from "@/components/ss/controls";
import { AxisTicks, Sparkbars } from "@/components/ss/charts";
import { safePct } from "@/lib/analytics";
import { agoShort, num, pct as fmtPct } from "@/lib/format";
import {
  bucketFollowSeries,
  type FollowBar,
  type FollowCoverage,
  type FollowPause,
  type FollowReport,
  type LatestFollower,
} from "@/lib/follows";
import { HideFollowSetupButton } from "./hide-follow-setup-button";

/** An Instagram chatbot in scope that can record follows but hasn't yet, and where to set it up. */
export interface FollowSetupLink {
  name: string;
  href: string;
}

/**
 * Statistics: new Instagram followers, as ManyChat's "Say hi to new followers"
 * automation reports them (lib/follows.ts). Two states:
 *  - nothing recorded yet for the bots in scope: a short prompt to add the step
 *    in ManyChat, with a link per chatbot that can record one and a "Hide" for
 *    accounts that won't use it (the page shows it only when there is such a
 *    chatbot);
 *  - otherwise: the count for the range, the change against the previous one
 *    (only when every bot was tracked for all of it), how many went on to start a
 *    conversation, a daily chart and the latest followers.
 * Follows exist only from the day an owner added the step, so whenever the range
 * reaches back before a bot's first recorded follow the card says so instead of
 * showing an untracked stretch as a real zero. It also says when nothing is being
 * recorded right now (a switched-off chatbot, an inactive plan: the webhook
 * refuses those follows, and ManyChat never sends them again). The coverage note
 * stays on the card because ManyChat does not report every follow, and a count
 * without it would read as the account's real total.
 */
export function NewFollowersCard({
  report,
  coverage,
  delta,
  deltaTone,
  setup,
  paused,
  botNames,
  accountId,
}: {
  report: FollowReport;
  coverage: FollowCoverage;
  /** The change against the previous period, already formatted ("+12%"); omit when it isn't fair. */
  delta?: string;
  deltaTone?: "good" | "bad";
  /** Instagram chatbots in scope that can record follows but have recorded none yet. */
  setup: FollowSetupLink[];
  /** Why the tracked chatbots in scope aren't recording right now, if anything stops them. */
  paused: FollowPause;
  /** Chatbot names by id, to name a bot whose first follow falls inside the range. */
  botNames: Record<string, string>;
  /** The account being viewed, whose setup prompt "Hide" hides. */
  accountId: string;
}) {
  if (!report.tracking) return <FollowersSetup setup={setup} accountId={accountId} />;

  const bars = bucketFollowSeries(report.series);
  // Follows per day, so a bar that covers fewer days is not drawn as a drop.
  const rates = bars.map((b) => b.follows / b.days);
  const peak = Math.max(0, ...rates);
  // A bot that began tracking days ago gives a one- or two-day series, which
  // would draw as full-width slabs rather than a chart: held back while the range
  // will still gain days (followCoverage), drawn as it is once it can't.
  const chartTooYoung = coverage.chartFillsIn;
  const firstFollow = report.firstFollowedAt ? utcDate(report.firstFollowedAt) : null;
  const lastFollow = report.lastFollowedAt ? utcDate(report.lastFollowedAt) : null;
  const pausedLine = pauseLine(paused);

  return (
    <SsCard className="p-[22px]">
      <SsCardHead
        icon={
          <SsIconTile tone="indigo" size={34}>
            <UserPlus className="h-[19px] w-[19px]" aria-hidden="true" />
          </SsIconTile>
        }
        title="New Instagram followers"
        description={`Reported by ManyChat's "Say hi to new followers" automation`}
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="ss-num text-[34px] leading-none text-ss-ink">
              {num(report.follows)}
            </span>
            {delta && (
              <span
                className={`text-[12.5px] font-semibold leading-none ${
                  deltaTone === "bad" ? "text-ss-rose" : "text-ss-green"
                }`}
              >
                {delta}
              </span>
            )}
            {coverage.previousComparable && report.prevFollows != null && (
              <span className="text-[12px] leading-none text-ss-muted">
                {num(report.prevFollows)} last period
              </span>
            )}
          </div>

          {coverage.startedAfterRange ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ss-body">
              The first follow was recorded on {firstFollow}, after this range,
              so there is nothing to count here.
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-ss-body">
              <MessageCircle
                className="mt-[3px] h-[15px] w-[15px] shrink-0 text-ss-indigo-600"
                aria-hidden="true"
              />
              <span>{conversationLine(report)}</span>
            </p>
          )}

          {pausedLine && (
            <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-ss-body">
              <PauseCircle
                className="mt-[3px] h-[15px] w-[15px] shrink-0 text-ss-amber"
                aria-hidden="true"
              />
              <span>{pausedLine}</span>
            </p>
          )}

          {coverage.lateBots.length > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-ss-muted">
              {lateBotsLine(coverage, report, botNames)}
            </p>
          )}

          {coverage.quiet && lastFollow && (
            <p className="mt-2 text-[12px] leading-relaxed text-ss-muted">
              The last follow was recorded on {lastFollow}. If you expected
              more since, check that the &quot;Say hi to new followers&quot;
              automation is live and that its External Request has the current
              secret. Meta can also pause this trigger or withdraw an
              account&apos;s access to it.
            </p>
          )}

          {report.follows > 0 && bars.length > 0 && !chartTooYoung && (
            <div className="mt-5">
              <Sparkbars
                data={rates.map((r) => ({
                  v: peak ? r / peak : 0,
                  peak: peak > 0 && r === peak,
                }))}
                height={96}
                className={barGap(bars.length)}
              />
              <AxisTicks labels={tickLabels(bars)} />
            </div>
          )}
          {report.follows > 0 && chartTooYoung && (
            <p className="mt-4 text-[12px] leading-relaxed text-ss-muted">
              The daily chart fills in as more days are tracked.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="ss-eyebrow mb-1 text-ss-muted">Latest followers</p>
          {report.latest.length === 0 ? (
            <p className="mt-2 text-[12px] leading-relaxed text-ss-muted">
              No follows were recorded in this range.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-ss-hair">
              {report.latest.map((f, i) => (
                <FollowerRow key={`${f.followed_at}-${i}`} follower={f} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {setup.length > 0 && (
        <p className="mt-5 text-[12px] leading-relaxed text-ss-body">
          Not tracked yet:{" "}
          <SetupLinks setup={setup} />. Add the ManyChat step to each one to count
          its followers here too.
        </p>
      )}

      <p className="mt-5 border-t border-ss-hair pt-4 text-[12px] leading-relaxed text-ss-muted">
        ManyChat only reports people who weren&apos;t already your ManyChat
        contacts (anyone who has messaged you, or got a DM from one of your
        automations such as comment-to-DM), and only once per person. Read this
        as the least you gained, not your exact total.
      </p>
    </SsCard>
  );
}

/** Nothing recorded yet: what to switch on, and where. */
function FollowersSetup({
  setup,
  accountId,
}: {
  setup: FollowSetupLink[];
  accountId: string;
}) {
  const only = setup.length === 1 ? setup[0] : null;
  return (
    <SsCard className="p-[22px]">
      <SsCardHead
        icon={
          <SsIconTile tone="indigo" size={34}>
            <UserPlus className="h-[19px] w-[19px]" aria-hidden="true" />
          </SsIconTile>
        }
        title="Track new Instagram followers"
        description="See who follows you and who goes on to start a conversation."
        action={
          <div className="flex items-center gap-2">
            <HideFollowSetupButton accountId={accountId} />
            {only && (
              <SsLinkButton href={only.href} variant="outline" size="md">
                Set it up
              </SsLinkButton>
            )}
          </div>
        }
      />
      <p className="mt-3 text-[12.5px] leading-relaxed text-ss-body">
        Add one step to ManyChat&apos;s &quot;Say hi to new followers&quot;
        automation, and each new follower it greets appears here. It works on
        Instagram accounts where ManyChat offers that automation.
      </p>
      {setup.length > 1 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ss-body">
          Set it up on each Instagram chatbot: <SetupLinks setup={setup} />.
        </p>
      )}
    </SsCard>
  );
}

function SetupLinks({ setup }: { setup: FollowSetupLink[] }) {
  return (
    <>
      {setup.map((s, i) => (
        <Fragment key={s.href}>
          {i > 0 && ", "}
          <Link
            href={s.href}
            className="font-semibold text-ss-indigo-600 hover:underline"
          >
            {s.name}
          </Link>
        </Fragment>
      ))}
    </>
  );
}

function FollowerRow({ follower }: { follower: LatestFollower }) {
  const handle = follower.username ? `@${follower.username}` : null;
  const name = follower.display_name ?? handle ?? "Instagram user";
  const detail = [follower.display_name ? handle : null, agoShort(follower.followed_at)]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-3 py-2.5">
      <SsAvatar
        name={follower.display_name ?? follower.username ?? "Instagram user"}
        size={30}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold leading-tight text-ss-ink">
          {name}
        </div>
        <div className="mt-1 truncate text-[11.5px] leading-tight text-ss-muted">
          {detail}
        </div>
      </div>
      {follower.messaged && follower.conversation_id && (
        <Link
          href={`/conversations/${follower.conversation_id}`}
          className="shrink-0 text-[11.5px] font-semibold text-ss-indigo-600 hover:underline"
        >
          Open chat
        </Link>
      )}
    </li>
  );
}

/**
 * How many of them went on to start a conversation: a DM, or a keyword comment
 * the bot answered (both open a thread; the data can't tell them apart).
 */
function conversationLine(r: FollowReport): string {
  if (r.follows === 0) return "No new followers recorded in this range.";
  if (r.messaged === 0) return "None of them has started a conversation yet.";
  const share = fmtPct(safePct(r.messaged, r.follows));
  return `${num(r.messaged)} of them started a conversation (${share}).`;
}

/** What stops recording right now, in the owner's words (the switch is "AI replies"). */
function pauseLine(p: FollowPause): string | null {
  if (p.planInactive) return "Nothing is being recorded while your plan is inactive.";
  if (p.botsOff.length === 1) {
    return `Nothing is being recorded for ${p.botsOff[0]} while its AI replies are off.`;
  }
  if (p.botsOff.length > 1) {
    return `Nothing is being recorded for ${joinNames(p.botsOff)} while their AI replies are off.`;
  }
  return null;
}

/**
 * The bots whose first recorded follow falls inside the range. The data only
 * knows the first recorded follow (the step can be live for days before someone
 * new follows), so earlier days "may not" have been counted.
 */
function lateBotsLine(
  coverage: FollowCoverage,
  report: FollowReport,
  botNames: Record<string, string>
): string {
  if (report.trackedBots.length === 1) {
    return `The first follow was recorded on ${utcDate(coverage.lateBots[0].firstFollowedAt)}, so earlier days in this range may not have been counted.`;
  }
  return coverage.lateBots
    .map(
      (b) =>
        `${botNames[b.id] ?? "One chatbot"} recorded its first follow on ${utcDate(b.firstFollowedAt)}, so its earlier days in this range may not have been counted.`
    )
    .join(" ");
}

function joinNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Sparkbars' 7px gap suits a week. More bars get tighter gaps so each one stays a
 * few pixels wide in the card's half-width column, even on a phone.
 */
function barGap(bars: number): string | undefined {
  if (bars > 20) return "gap-[2px]";
  if (bars > 10) return "gap-[4px]";
  return undefined;
}

/** Past this span MM/DD labels become ambiguous, so the axis names months and years. */
const YEAR_LABEL_SPAN_DAYS = 366;

/**
 * First, middle and last day under the chart, like "Activity over time", except
 * that the last label is the chart's real last day (a bar can cover several). A
 * chart that spans more than a year labels months with the year; a short one
 * that merely crosses New Year keeps its days ("12/27 · 12/30 · 01/02").
 */
function tickLabels(bars: FollowBar[]): string[] {
  if (bars.length === 0) return [];
  const firstDay = bars[0].day;
  const lastDay = bars[bars.length - 1].lastDay;
  const spanDays =
    (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000;
  const fmt = spanDays > YEAR_LABEL_SPAN_DAYS ? monthYear : dayTick;
  if (bars.length <= 3) return bars.map((b) => fmt(b.day));
  return [fmt(firstDay), fmt(bars[Math.floor(bars.length / 2)].day), fmt(lastDay)];
}

// Every date on this card is a UTC day, like the report's day series, so each is
// formatted in UTC: formatted in the server's own zone, "2026-11-10" would read
// as 11/09 on any server behind UTC.

/** "11/10", for a YYYY-MM-DD day. */
function dayTick(day: string): string {
  return utcFormat(`${day}T00:00:00Z`, { month: "2-digit", day: "2-digit" });
}

/** "Sep 2026", for a YYYY-MM-DD day. */
function monthYear(day: string): string {
  return utcFormat(`${day}T00:00:00Z`, { month: "short", year: "numeric" });
}

/** "Oct 20, 2026", for a timestamp. */
function utcDate(iso: string): string {
  return utcFormat(iso, { month: "short", day: "numeric", year: "numeric" });
}

function utcFormat(value: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
