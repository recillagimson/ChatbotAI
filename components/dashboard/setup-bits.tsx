import type { ReactNode } from "react";

/** Small presentational pieces shared by the bot's setup cards (Connection tab). */

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[5px] bg-ss-chip px-1.5 py-0.5 font-mono text-[11.5px] text-ss-ink">
      {children}
    </code>
  );
}

/** One numbered setup step, styled like the ManyChat guide in Settings. */
export function SetupStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-ss-indigo-50 font-display text-[11px] font-bold leading-none text-ss-indigo-600"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="text-[12.5px] leading-relaxed text-ss-body">{children}</span>
    </li>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="ss-eyebrow mb-1.5 text-ss-muted">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-chip bg-ss-page px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-ss-ink">
        {value}
      </pre>
    </div>
  );
}
