import { Sk, SkPage, SkNavyPanel } from "@/components/ss/skeleton";

/**
 * Mirrors the redesigned clients screen: the shared PageShell/PageHeader/PageBody
 * frame (via SkPage), the navy Overview hero, then the card-per-row client list.
 * Same measurements as the real page so nothing shifts when the data lands.
 */
export default function AdminClientsLoading() {
  return (
    <SkPage label="Loading clients" title="w-24" actions={0}>
      <SkNavyPanel height="h-[128px]" />

      {/* Tabs + search row */}
      <div className="flex flex-wrap items-center gap-2">
        <Sk className="h-[34px] w-20 rounded-full" />
        <Sk className="h-[34px] w-24 rounded-full" />
        <Sk className="h-[34px] w-24 rounded-full" />
        <Sk className="ml-auto h-[38px] w-full rounded-ctl-lg sm:w-72" />
      </div>

      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3.5 rounded-card border border-ss-line bg-white px-5 py-3.5"
          >
            <Sk className="h-[38px] w-[38px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Sk className="h-[14px] w-44" />
              <Sk className="mt-2.5 h-[11px] w-56" />
            </div>
            <Sk className="hidden h-[11px] w-16 shrink-0 sm:block" />
            <Sk className="hidden h-[11px] w-24 shrink-0 md:block" />
            <Sk className="h-[22px] w-16 shrink-0 rounded-full" />
            <Sk className="h-[34px] w-14 shrink-0 rounded-ctl-lg" />
            <Sk className="h-[16px] w-24 shrink-0" />
          </div>
        ))}
      </div>
    </SkPage>
  );
}
