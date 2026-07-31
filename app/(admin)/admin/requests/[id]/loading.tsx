import { Sk } from "@/components/ss/skeleton";

/** One change request, with its diff. */
export default function AdminRequestLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading this request</span>
      <Sk className="h-[14px] w-32" tone="on-page" />
      <Sk className="mt-4 h-[28px] w-72" tone="on-page" />
      <div className="mt-6 rounded-lg border border-ss-line bg-white p-4">
        <Sk className="h-[14px] w-28" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Sk key={i} className={`h-[14px] ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
          ))}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Sk className="h-[38px] w-28 rounded-md" tone="on-page" />
        <Sk className="h-[38px] w-28 rounded-md" tone="on-page" />
      </div>
    </div>
  );
}
