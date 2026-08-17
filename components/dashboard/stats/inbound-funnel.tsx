"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, TrendingUp } from "lucide-react";
import { num, pct as fmtPct, shortDate } from "@/lib/format";
import { SsCardHead, SsIconTile } from "@/components/ss/card";
import { SsLinkButton } from "@/components/ss/controls";
import { FunnelStep, FunnelConnector } from "@/components/ss/charts";

export interface FunnelStageInput {
  /** entry | replied | link_sent | subscribed */
  key: string;
  label: string;
  count: number;
  /** Depth in the funnel (0 = entry), sets inset + colour. */
  level: 0 | 1 | 2 | 3;
}

interface Member {
  id: string;
  name: string;
  date: string;
}

interface StageState {
  rows: Member[];
  /** How many rows we've requested so far (the limit for the next fetch). */
  n: number;
  loading: boolean;
  error: boolean;
}

interface InboundFunnelProps {
  stages: FunnelStageInput[];
  /** The page's range/scope params, used to build the stage + export URLs. */
  params: { range?: string; from?: string; to?: string; bot?: string };
}

const PAGE = 8;

/** Surviving share between two stages (how many carried on). */
function survived(count: number, prevCount: number): number | null {
  return prevCount > 0 ? (count / prevCount) * 100 : null;
}

/**
 * The Statistics "Inbound bot funnel" - interactive drill-down.
 *
 * Expanding a stage used to be a `?stage=` URL that re-ran the ENTIRE statistics
 * report on the server (skeleton flash and all). Now expansion is client state:
 * clicking a stage loads ONLY that stage's members from `/api/statistics/stage`,
 * and every non-empty stage is PRELOADED once after mount, so the first click is
 * instant. The rest of the report never re-renders.
 *
 * A fresh instance mounts per range/scope (the report's Suspense is keyed on
 * those), so the preload always reflects the current period.
 */
export function InboundFunnel({ stages, params }: InboundFunnelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [byStage, setByStage] = useState<Record<string, StageState>>({});
  // A ref so the click/load-more handlers read the latest state without being
  // re-created (and without re-triggering the preload effect).
  const byStageRef = useRef(byStage);
  byStageRef.current = byStage;

  const scopeQs = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams();
      for (const k of ["range", "from", "to", "bot"] as const) {
        if (params[k]) p.set(k, params[k] as string);
      }
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [params],
  );

  const fetchStage = useCallback(
    async (key: string, n: number, signal?: AbortSignal) => {
      setByStage((s) => ({
        ...s,
        [key]: {
          rows: s[key]?.rows ?? [],
          n: s[key]?.n ?? 0,
          loading: true,
          error: false,
        },
      }));
      try {
        const res = await fetch(
          `/api/statistics/stage?${scopeQs({ stage: key, n: String(n) })}`,
          { signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rows?: Member[] };
        setByStage((s) => ({
          ...s,
          [key]: { rows: data.rows ?? [], n, loading: false, error: false },
        }));
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setByStage((s) => ({
          ...s,
          [key]: {
            rows: s[key]?.rows ?? [],
            n: s[key]?.n ?? 0,
            loading: false,
            error: true,
          },
        }));
      }
    },
    [scopeQs],
  );

  // Preload the first page of every non-empty stage after mount, so the first
  // click is instant. One instance mounts per range/scope, so this stays current.
  useEffect(() => {
    const ctrl = new AbortController();
    for (const st of stages) {
      if (st.count > 0) fetchStage(st.key, PAGE, ctrl.signal);
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStage]);

  function toggle(key: string, count: number) {
    setExpanded((cur) => (cur === key ? null : key));
    const st = byStageRef.current[key];
    // Not preloaded yet (or a prior error) and there's something to show: fetch.
    if (count > 0 && (!st || (st.rows.length === 0 && !st.loading))) {
      fetchStage(key, PAGE);
    }
  }

  function loadMore(key: string) {
    const st = byStageRef.current[key];
    if (st?.loading) return;
    fetchStage(key, (st?.n ?? PAGE) + PAGE);
  }

  const exportStage =
    expanded && (byStage[expanded]?.rows.length ?? 0) > 0 ? expanded : null;

  return (
    <>
      <SsCardHead
        icon={
          <SsIconTile tone="indigo" size={34}>
            <TrendingUp className="h-[19px] w-[19px]" aria-hidden="true" />
          </SsIconTile>
        }
        title="Inbound bot funnel"
        description="Click a stage to see who's in it"
        action={
          exportStage ? (
            <SsLinkButton
              href={`/api/statistics/export?${scopeQs({ stage: exportStage })}`}
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export stage
            </SsLinkButton>
          ) : undefined
        }
      />

      <div className="mt-5 flex flex-col gap-[9px]">
        {stages.map((st, i) => {
          const prev = stages[i - 1];
          const passed = prev ? survived(st.count, prev.count) : null;
          return (
            <div key={st.key} className="contents">
              {prev && (
                <FunnelConnector
                  pct={fmtPct(passed)}
                  tone={passed != null && passed < 50 ? "amber" : "plain"}
                />
              )}
              <FunnelStep
                label={st.label}
                value={num(st.count)}
                level={st.level}
                onClick={() => toggle(st.key, st.count)}
                expanded={expanded === st.key}
              >
                <StageList
                  state={byStage[st.key]}
                  total={st.count}
                  onLoadMore={() => loadMore(st.key)}
                />
              </FunnelStep>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The contacts under one expanded stage. */
function StageList({
  state,
  total,
  onLoadMore,
}: {
  state: StageState | undefined;
  total: number;
  onLoadMore: () => void;
}) {
  const note =
    "mt-[7px] rounded-chip border border-ss-rule bg-white px-4 py-3 text-[12px] text-ss-muted";

  // Still loading its first page (preload in flight, or a fresh open).
  if (!state || (state.loading && state.rows.length === 0)) {
    return <p className={note}>Loading…</p>;
  }
  if (state.error && state.rows.length === 0) {
    return <p className={note}>Couldn&apos;t load this stage - try again.</p>;
  }
  if (state.rows.length === 0) {
    return (
      <p className={note}>No threads reached this stage in this period.</p>
    );
  }

  return (
    <div className="mt-[7px] overflow-hidden rounded-chip border border-ss-rule bg-white shadow-ss-pop">
      <div className="ss-scroll max-h-[196px] overflow-auto">
        {state.rows.map((r, i) => (
          <Link
            key={r.id}
            href={`/conversations/${r.id}`}
            className={`flex items-center gap-2.5 px-[15px] py-3 transition-colors hover:bg-ss-page ${
              i > 0 ? "border-t border-ss-hair-2" : ""
            }`}
          >
            <span className="truncate text-[12.5px] font-semibold leading-none text-ss-ink">
              {r.name}
            </span>
            <span className="ml-auto shrink-0 text-[11.5px] leading-none text-ss-muted">
              {shortDate(r.date)}
            </span>
          </Link>
        ))}
      </div>
      {total > state.rows.length && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={state.loading}
          className="flex w-full items-center gap-2 border-t border-ss-hair bg-ss-page-alt px-[15px] py-3 text-[12px] font-semibold text-ss-indigo-600 transition-colors hover:bg-ss-page disabled:opacity-60"
        >
          {state.loading ? "Loading…" : "Load more"}
          <span className="font-normal text-ss-muted">
            ({state.rows.length} of {num(total)})
          </span>
        </button>
      )}
    </div>
  );
}
