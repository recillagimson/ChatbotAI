import { Phone } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { SUPPORT_CONTACTS, SUPPORT_HOURS } from "@/lib/support-contacts";
import { FeedbackPageForm } from "@/components/dashboard/feedback-page-form";
import { FeedbackHistory } from "@/components/dashboard/feedback-history";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { NavyPanel } from "@/components/ss/panel";
import type { Attachment, Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Feedback - the form, the humans, and what you already sent.
 *
 * The design puts the two phone numbers directly beside the form rather than
 * below it: most of what people write here is urgent, and a number they can tap
 * now beats a message answered later.
 */
export default async function FeedbackPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [{ data: chatbots }, { data: feedbackData }] = await Promise.all([
    supabase
      .from("chatbots")
      .select("id, name")
      .eq("user_id", user!.id)
      .order("name"),
    supabase
      .from("feedback")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
  ]);

  const feedback = (feedbackData ?? []) as Feedback[];

  const items = await Promise.all(
    feedback.map(async (fb) => {
      const att = (fb.attachments ?? []) as Attachment[];
      const signed = await Promise.all(
        att.map(async (a) => ({
          ...a,
          url: await signAttachment(supabase, a.path),
        }))
      );
      return { ...fb, attachments: signed };
    })
  );

  return (
    <PageShell>
      <PageHeader
        title="Feedback"
        description="Tell the SpeedSettr team what's working or what to fix."
      />

      <PageBody>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:items-start">
          <SsCard className="p-[22px]">
            <FeedbackPageForm chatbots={chatbots ?? []} />
          </SsCard>

          <div className="flex flex-col gap-5">
            <NavyPanel streaks={false} className="p-[22px]">
              <div className="font-display text-[15px] font-bold leading-tight text-white">
                Need help now?
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ss-nav-text">
                Call or text the team directly - {SUPPORT_HOURS}.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                {SUPPORT_CONTACTS.map((c) => (
                  <a
                    key={c.tel}
                    href={`tel:${c.tel}`}
                    className="flex items-center gap-2.5 rounded-chip border border-white/10 bg-white/[.07] px-3.5 py-3 transition-colors hover:bg-white/[.12]"
                  >
                    <Phone
                      className="h-[17px] w-[17px] shrink-0 text-ss-indigo-300"
                      aria-hidden="true"
                    />
                    <span className="text-[13px] font-semibold leading-none text-white">
                      @{c.name}
                    </span>
                    <span className="ml-auto text-[12.5px] font-semibold leading-none tabular-nums text-ss-indigo-300">
                      {c.phone}
                    </span>
                  </a>
                ))}
              </div>
            </NavyPanel>

            <SsCard className="p-[22px]">
              <SsCardHead title="Your feedback" />
              <div className="mt-4">
                <FeedbackHistory items={items} />
              </div>
            </SsCard>
          </div>
        </div>
      </PageBody>
    </PageShell>
  );
}
