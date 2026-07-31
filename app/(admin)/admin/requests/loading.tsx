import { Sk } from "@/components/ss/skeleton";

/** The admin change-request queue. */
export default function AdminRequestsLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading change requests</span>
      <Sk className="h-[28px] w-52" tone="on-page" />
      <Sk className="mt-3 h-[14px] w-80" tone="on-page" />
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-ss-line bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sk className="h-[13px] w-64" />
                <Sk className="mt-2.5 h-[11px] w-40" />
              </div>
              <Sk className="h-[22px] w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
