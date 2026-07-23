import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { FeedbackPageForm } from "@/components/dashboard/feedback-page-form";
import { FeedbackHistory } from "@/components/dashboard/feedback-history";
import { SupportContactsCard } from "@/components/dashboard/support-contacts-card";
import type { Attachment, Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Feedback
        </h1>
        <p className="text-muted-foreground">
          Tell the SpeedSettr team what&apos;s working or what to fix.
        </p>
      </div>

      <div className="mb-10">
        <FeedbackPageForm chatbots={chatbots ?? []} />
      </div>

      <div className="mb-10">
        <SupportContactsCard />
      </div>

      <section>
        <h2 className="mb-4 text-xl font-display font-semibold tracking-tight">
          Your feedback
        </h2>
        <FeedbackHistory items={items} />
      </section>
    </div>
  );
}
