import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** Settings: two columns so nothing hides below the fold. */
export default function SettingsLoading() {
  return (
    <SkPage label="Loading settings" title="w-28" actions={0}>
      <div className="mx-auto grid w-full max-w-[64rem] gap-5 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <SkCard key={col} className="p-6">
            <Sk className="h-[15px] w-24" />
            <Sk className="mt-2.5 h-[12px] w-56" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="mt-5">
                <Sk className="h-[12px] w-20" />
                <Sk className="mt-2.5 h-[42px] w-full rounded-ctl-lg" />
              </div>
            ))}
            <Sk className="mt-6 h-[40px] w-36 rounded-ctl-lg" />
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
