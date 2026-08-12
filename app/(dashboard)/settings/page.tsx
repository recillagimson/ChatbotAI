import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ChangePasswordForm } from "@/components/dashboard/change-password-form";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";

export const dynamic = "force-dynamic";

/**
 * Settings - two columns so nothing hides below the fold.
 *
 * The design's reason: a single stacked column pushed the ManyChat connection
 * (the thing people come here to fix) under two forms they rarely touch.
 */
export default async function SettingsPage() {
  // Settings is out of scope for "view as client" (a client's profile/password
  // isn't editable through the admin's session). Hidden from the sidebar; also
  // redirect direct URL access so it isn't reachable while impersonating.
  if ((await getImpersonation()).active) redirect("/dashboard");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description="Your profile, password and ManyChat integration."
      />

      <PageBody>
        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Profile"
              description="Shown to the SpeedSettr team on your requests."
              className="mb-5"
            />
            <SettingsForm profile={profile} email={user!.email ?? ""} />
          </SsCard>

          <div className="flex flex-col gap-5">
            <SsCard className="p-[22px]">
              <SsCardHead
                title="Password"
                description="At least 8 characters. You'll stay signed in here."
                className="mb-5"
              />
              <ChangePasswordForm email={user!.email ?? ""} />
            </SsCard>

            <SsCard className="p-[22px]">
              <SsCardHead
                title="ManyChat connection guide"
                description="Six steps in your ManyChat dashboard to send DMs into SpeedSettr. The per-chatbot values live on each chatbot's Connection tab."
                className="mb-5"
              />
              <ol className="flex flex-col gap-3.5">
                <Step n={1}>
                  In ManyChat, go to <B>Automation → New Flow</B> and add a
                  trigger: <B>&ldquo;User sends a message&rdquo;</B>.
                </Step>
                <Step n={2}>
                  Add an action <B>External Request</B>. Method <B>POST</B>, URL{" "}
                  <Code>{appUrl}/api/webhooks/manychat</Code>
                </Step>
                <Step n={3}>
                  Add a header named <Code>x-manychat-secret</Code> and paste the
                  secret from <B>Chatbots → [your chatbot] → Connection</B>. Each
                  chatbot has its own.
                </Step>
                <Step n={4}>
                  Set the JSON body - copy the template from that same Connection
                  tab, set <Code>platform</Code> to this flow&apos;s channel, and
                  use <B>+ Add Full Contact Data</B> for the <Code>contact</Code>{" "}
                  value (that&apos;s what keeps long, multi-line messages from
                  breaking the request).
                </Step>
                <Step n={5}>
                  Also create an <B>Instagram Default Reply</B> automation
                  pointing at the same request, set to run every time. It&apos;s
                  the catch-all that fires on messages the AI trigger skips.
                </Step>
                <Step n={6}>
                  Publish the flow and connect your channel in ManyChat under{" "}
                  <B>Settings → Channels</B>.
                </Step>
              </ol>
            </SsCard>
          </div>
        </div>
      </PageBody>
    </PageShell>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-ss-indigo-50 font-display text-[11px] font-bold leading-none text-ss-indigo-600"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="text-[12.5px] leading-relaxed text-ss-body">{children}</span>
    </li>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ss-ink">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded-[5px] bg-ss-chip px-1.5 py-0.5 font-mono text-[11.5px] text-ss-ink">
      {children}
    </code>
  );
}
