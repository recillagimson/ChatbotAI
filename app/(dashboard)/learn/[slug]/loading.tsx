import { Sk, SkPage, SkText } from "@/components/ss/skeleton";

/** One lesson: a centred column of headed sections. */
export default function LessonLoading() {
  return (
    <SkPage label="Loading this lesson" title="w-64" actions={0}>
      <div className="mx-auto w-full max-w-[46rem]">
        <Sk className="h-1 w-full rounded-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-8">
            <Sk className="h-[17px] w-56" />
            <SkText className="mt-4" lines={4} />
          </div>
        ))}
        <Sk className="mt-8 h-[86px] w-full rounded-card" />
      </div>
    </SkPage>
  );
}
