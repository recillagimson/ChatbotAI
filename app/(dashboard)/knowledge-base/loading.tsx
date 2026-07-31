import { Sk, SkCard, SkCardHead, SkPage } from "@/components/ss/skeleton";

/** Knowledge base: the coverage meter, the add box, then the entries. */
export default function KnowledgeBaseLoading() {
  return (
    <SkPage label="Loading the knowledge base" title="w-48" actions={0}>
      <SkCard className="px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <Sk className="h-[11px] w-20" />
            <Sk className="mt-2.5 h-[18px] w-40" />
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Sk key={i} className="h-[7px] w-[52px] rounded-full" />
            ))}
          </div>
          <Sk className="ml-auto h-[12px] w-28" />
        </div>
      </SkCard>

      <SkCard>
        <SkCardHead />
        <Sk className="mt-4 h-[42px] w-full rounded-ctl-lg" />
        <Sk className="mt-3.5 h-[38px] w-32 rounded-ctl-lg" />
      </SkCard>

      <SkCard>
        <SkCardHead width="w-36" />
        <Sk className="mt-4 h-[120px] w-full rounded-ctl-lg" />
        <Sk className="mt-3.5 h-[40px] w-36 rounded-ctl-lg" />
      </SkCard>

      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <SkCard key={i} className="px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sk className="h-[13px] w-56" />
                <Sk className="mt-2.5 h-[11px] w-32" />
              </div>
              <Sk className="h-[32px] w-20 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
