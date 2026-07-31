import { Sk } from "@/components/ss/skeleton";

/** The admin feedback inbox. */
export default function AdminFeedbackLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading feedback</span>
      <Sk className="h-[28px] w-40" tone="on-page" />
      <Sk className="mt-3 h-[14px] w-72" tone="on-page" />
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-ss-line bg-white p-4">
            <div className="flex items-center gap-3">
              <Sk className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Sk className="h-[13px] w-44" />
                <Sk className="mt-2.5 h-[11px] w-32" />
              </div>
              <Sk className="h-[11px] w-16" />
            </div>
            <Sk className="mt-3.5 h-[12px] w-full" />
            <Sk className="mt-2 h-[12px] w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
