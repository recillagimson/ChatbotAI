import { Sk } from "@/components/ss/skeleton";

/**
 * Admin keeps its own plain shell (max-w-6xl, no dashboard chrome), so these
 * skeletons match that rather than the redesigned dashboard frame.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading the admin console</span>
      <Sk className="h-[28px] w-40" tone="on-page" />
      <Sk className="mt-3 h-[14px] w-72" tone="on-page" />
      <div className="mt-8 rounded-lg border border-ss-line bg-white">
        <div className="border-b border-ss-hair px-4 py-3">
          <Sk className="h-[12px] w-32" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-ss-hair" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <Sk className="h-[13px] w-52" />
              <Sk className="mt-2.5 h-[11px] w-36" />
            </div>
            <Sk className="h-[22px] w-16 rounded-full" />
            <Sk className="h-[32px] w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
