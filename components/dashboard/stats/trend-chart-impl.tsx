"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type SeriesPoint = { day: string; conversations: number; ai_replies: number };

/** Parse "YYYY-MM-DD" without timezone offset surprises. */
function parseDayParts(day: string): [number, number, number] {
  const parts = day.split("-");
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** Format "YYYY-MM-DD" → "MM/DD". */
function shortTick(day: string): string {
  const [, m, d] = parseDayParts(day);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

/** Format "YYYY-MM-DD" → "Month D, YYYY" for tooltip. */
function longLabel(day: string): string {
  const [y, m, d] = parseDayParts(day);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function TrendChartImpl({ series }: { series: SeriesPoint[] }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    setPrefersReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  if (series.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No activity in this range yet.
        </p>
      </div>
    );
  }

  const chart1 = "hsl(var(--chart-1))";
  const chart2 = "hsl(var(--chart-2))";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={series}
        margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradConversations" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chart1} stopOpacity={0.3} />
            <stop offset="95%" stopColor={chart1} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradAiReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chart2} stopOpacity={0.3} />
            <stop offset="95%" stopColor={chart2} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--muted-foreground) / 0.2)"
          vertical={false}
        />

        <XAxis
          dataKey="day"
          tickFormatter={shortTick}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          dy={8}
          className="tabular-nums"
        />

        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={36}
          className="tabular-nums"
        />

        <Tooltip
          labelFormatter={longLabel}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
            color: "hsl(var(--card-foreground))",
            fontSize: 13,
          }}
          itemStyle={{ color: "hsl(var(--card-foreground))" }}
          cursor={{ stroke: "hsl(var(--muted-foreground) / 0.3)", strokeWidth: 1 }}
        />

        <Legend
          wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
          formatter={(value) =>
            value === "conversations" ? "Conversations" : "AI replies"
          }
        />

        <Area
          type="monotone"
          dataKey="conversations"
          name="conversations"
          stroke={chart1}
          strokeWidth={2}
          fill="url(#gradConversations)"
          isAnimationActive={!prefersReducedMotion}
          dot={false}
          activeDot={{ r: 4, stroke: chart1, strokeWidth: 2 }}
        />

        <Area
          type="monotone"
          dataKey="ai_replies"
          name="ai_replies"
          stroke={chart2}
          strokeWidth={2}
          fill="url(#gradAiReplies)"
          isAnimationActive={!prefersReducedMotion}
          dot={false}
          activeDot={{ r: 4, stroke: chart2, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
