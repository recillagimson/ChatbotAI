import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** The new-chatbot form. */
export default function NewChatbotLoading() {
  return (
    <SkPage label="Loading the new chatbot form" title="w-44" actions={0}>
      <div className="mx-auto w-full max-w-[44rem]">
        <SkCard className="p-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={i > 0 ? "mt-5" : ""}>
              <Sk className="h-[12px] w-28" />
              <Sk className={`mt-2.5 w-full rounded-ctl-lg ${i === 3 ? "h-[140px]" : "h-[42px]"}`} />
            </div>
          ))}
          <Sk className="mt-6 h-[42px] w-40 rounded-ctl-lg" />
        </SkCard>
      </div>
    </SkPage>
  );
}
