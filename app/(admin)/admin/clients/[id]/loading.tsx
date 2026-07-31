import { Sk } from "@/components/ss/skeleton";

/** One client's admin detail. */
export default function AdminClientLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading this client</span>
      <Sk className="h-[14px] w-24" tone="on-page" />
      <Sk className="mt-4 h-[28px] w-64" tone="on-page" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-ss-line bg-white p-4">
            <Sk className="h-[11px] w-24" />
            <Sk className="mt-3 h-[22px] w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-ss-line bg-white p-4">
        <Sk className="h-[14px] w-32" />
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Sk key={i} className="h-[46px] w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
