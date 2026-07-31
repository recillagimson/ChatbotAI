import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** The chatbot list - one card per bot. */
export default function ChatbotsLoading() {
  return (
    <SkPage label="Loading your chatbots" title="w-32" actions={1}>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {[0, 1].map((i) => (
          <SkCard key={i}>
            <div className="flex items-center gap-3">
              <Sk className="h-[38px] w-[38px] shrink-0 rounded-ctl-lg" />
              <div className="min-w-0 flex-1">
                <Sk className="h-[15px] w-32" />
                <Sk className="mt-2.5 h-[11px] w-24" />
              </div>
            </div>
            <Sk className="mt-3.5 h-[12px] w-full" />
            <Sk className="mt-2 h-[12px] w-4/5" />
            <div className="mt-4 flex gap-6 border-t border-ss-hair pt-4">
              {[0, 1, 2].map((j) => (
                <div key={j}>
                  <Sk className="h-[18px] w-10" />
                  <Sk className="mt-2 h-[10px] w-16" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-ss-hair pt-4">
              <Sk className="h-[20px] w-9 rounded-full" />
              <Sk className="ml-auto h-[34px] w-24 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
