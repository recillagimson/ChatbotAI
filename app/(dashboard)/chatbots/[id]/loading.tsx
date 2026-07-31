import { Sk, SkCard, SkCardHead, SkPage, SkTabs } from "@/components/ss/skeleton";

/**
 * A chatbot's detail page. The tab strip is part of the header, so it's drawn
 * in the skeleton too - the tabs are the first thing you reach for and they
 * shouldn't appear late.
 */
export default function ChatbotDetailLoading() {
  return (
    <SkPage
      label="Loading this chatbot"
      title="w-44"
      actions={2}
      below={<SkTabs count={7} />}
    >
      <div className="rounded-card bg-ss-navy px-[22px] py-[18px]">
        <div className="flex items-center gap-6">
          <Sk className="h-[38px] w-[38px] shrink-0 rounded-ctl-lg" tone="on-navy" />
          <div>
            <Sk className="h-[11px] w-24" tone="on-navy" />
            <Sk className="mt-2.5 h-[16px] w-48" tone="on-navy" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="hidden sm:block">
              <Sk className="h-[11px] w-20" tone="on-navy" />
              <Sk className="mt-2.5 h-[18px] w-14" tone="on-navy" />
            </div>
          ))}
          <Sk className="ml-auto h-[26px] w-12 rounded-full" tone="on-navy" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <SkCard>
          <SkCardHead width="w-28" />
          <div className="mt-4 flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <Sk key={i} className="h-[68px] w-full rounded-chip" />
            ))}
          </div>
        </SkCard>
        <SkCard>
          <SkCardHead width="w-36" />
          <div className="mt-4 flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <Sk key={i} className="h-[86px] w-full rounded-chip" />
            ))}
          </div>
        </SkCard>
      </div>
    </SkPage>
  );
}
