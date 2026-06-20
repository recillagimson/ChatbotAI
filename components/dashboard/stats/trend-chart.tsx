"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

type SeriesPoint = { day: string; conversations: number; ai_replies: number };

const Impl = dynamic(
  () => import("./trend-chart-impl").then((m) => m.TrendChartImpl),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
);

export function TrendChart({ series }: { series: SeriesPoint[] }) {
  return (
    <div className="h-[300px] w-full">
      <Impl series={series} />
    </div>
  );
}
