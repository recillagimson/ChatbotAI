import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversionPillProps {
  /** Step-through rate 0–100, or null when prev stage is 0 or next is a stub */
  pct: number | null;
}

/** Tone thresholds matching the brief */
function pillTone(pct: number | null): "good" | "mid" | "bad" {
  if (pct === null) return "bad";
  if (pct >= 50) return "good";
  if (pct >= 20) return "mid";
  return "bad";
}

const toneStyles: Record<"good" | "mid" | "bad", string> = {
  // bg + text — ≥4.5:1 contrast on white card surfaces
  good: "bg-conv-good/15 text-conv-good border border-conv-good/30",
  mid: "bg-conv-mid/15 text-conv-mid border border-conv-mid/30",
  bad: "bg-conv-bad/15 text-conv-bad border border-conv-bad/30",
};

const toneLabel: Record<"good" | "mid" | "bad", string> = {
  good: "good conversion",
  mid: "moderate conversion",
  bad: "low conversion",
};

/**
 * Conversion pill rendered between two funnel stages.
 * Carries BOTH the color/icon AND the text percentage — never color alone.
 */
export function ConversionPill({ pct }: ConversionPillProps) {
  const tone = pillTone(pct);
  const display = pct === null ? "—" : `${pct.toFixed(1)}%`;

  return (
    <div className="flex items-center justify-center py-0.5" aria-label={`Conversion rate: ${display} (${toneLabel[tone]})`}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
          toneStyles[tone],
        )}
      >
        {/* Icon carries semantic meaning (direction) even without color */}
        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{display}</span>
        <span className="sr-only">{toneLabel[tone]}</span>
      </span>
    </div>
  );
}
