import { SsCard, SsCardHead } from "@/components/ss/card";
import { Code, Field, SetupStep } from "@/components/dashboard/setup-bits";

/** Anchor the Connection card's TikTok sentence links to. */
export const TIKTOK_ANCHOR = "connect-tiktok";

/**
 * How to connect TikTok (Connection tab). ManyChat has no API to send to a TikTok
 * contact, so the webhook returns the reply in its response and the owner's flow sends
 * it (the response path in app/api/webhooks/manychat/route.ts). The flow clears the
 * field first and only sends when it has a value: a turn the bot answers with silence
 * returns an empty reply, which must not re-send the previous turn's text.
 */
export function TikTokSetupCard({ chatbotId }: { chatbotId: string }) {
  return (
    <SsCard id={TIKTOK_ANCHOR} className="scroll-mt-24 p-[22px]">
      <SsCardHead
        title="Connect TikTok"
        description="ManyChat can't send to TikTok on its own yet, so the reply comes back in the request and your flow sends it."
        className="mb-5"
      />
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-relaxed text-ss-body">
          You need a TikTok Business account with messaging connected in ManyChat.
          TikTok messaging isn&apos;t available for accounts in the EU, the UK or
          Switzerland.
        </p>
        <ol className="flex flex-col gap-3">
          <SetupStep n={1}>
            In ManyChat, create a TikTok automation with the trigger{" "}
            <strong className="font-semibold text-ss-ink">User sends a message</strong>.
          </SetupStep>
          <SetupStep n={2}>
            Add the action{" "}
            <strong className="font-semibold text-ss-ink">Clear Custom Field</strong>{" "}
            for a text field named <Code>ai_reply</Code> (create it if you don&apos;t
            have one). This stops an earlier reply from being sent again.
          </SetupStep>
          <SetupStep n={3}>
            Add an{" "}
            <strong className="font-semibold text-ss-ink">External Request</strong>{" "}
            with the same URL, method and header as above, and the body below. As
            above, replace <Code>{"<Full Contact Data>"}</Code> using{" "}
            <strong className="font-semibold text-ss-ink">+ Add Full Contact Data</strong>.
          </SetupStep>
        </ol>
        <Field
          label="JSON body (TikTok)"
          value={`{
  "chatbot_id": "${chatbotId}",
  "platform": "tiktok",
  "contact": <Full Contact Data>
}`}
        />
        <ol start={4} className="flex flex-col gap-3">
          <SetupStep n={4}>
            In the request&apos;s{" "}
            <strong className="font-semibold text-ss-ink">Response Mapping</strong>,
            map the field <Code>reply</Code> to <Code>ai_reply</Code>.
          </SetupStep>
          <SetupStep n={5}>
            Add a <strong className="font-semibold text-ss-ink">Condition</strong>:{" "}
            <Code>ai_reply</Code> has any value. On that branch, add a{" "}
            <strong className="font-semibold text-ss-ink">Send Message</strong> step
            that sends <Code>ai_reply</Code>. When the bot stays quiet on purpose, the
            reply comes back empty and nothing is sent.
          </SetupStep>
        </ol>
        <p className="text-[12.5px] leading-relaxed text-ss-muted">
          On TikTok each reply arrives as one message and links are written as plain
          text. Follow-ups, images, link buttons, the welcome voice message and
          replying from the inbox aren&apos;t available there. If the AI takes too
          long, the contact gets a short holding line instead of nothing.
        </p>
      </div>
    </SsCard>
  );
}
