import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** Onboarding: a short centred sequence of steps. */
export default function OnboardingLoading() {
  return (
    <SkPage label="Loading setup" title="w-40" actions={0}>
      <div className="mx-auto w-full max-w-[44rem]">
        <SkCard className="p-6">
          <Sk className="h-[18px] w-56" />
          <Sk className="mt-3 h-[12px] w-full" />
          <div className="mt-6 flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Sk key={i} className="h-[62px] w-full rounded-chip" />
            ))}
          </div>
          <Sk className="mt-6 h-[42px] w-36 rounded-ctl-lg" />
        </SkCard>
      </div>
    </SkPage>
  );
}
