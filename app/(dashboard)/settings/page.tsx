import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ChangePasswordForm } from "@/components/dashboard/change-password-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile and ManyChat integration.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm profile={profile} email={user!.email ?? ""} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Change the password you use to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={user!.email ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ManyChat connection guide</CardTitle>
          <CardDescription>
            Follow these steps in your ManyChat dashboard to send DMs into
            SpeedSettr.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Step n={1}>
            In ManyChat, go to <b>Automation → New Flow</b> and add a trigger:{" "}
            <b>&quot;User sends a message&quot;</b>.
          </Step>
          <Step n={2}>
            Add an action <b>External Request</b>. Method: <b>POST</b>. URL:{" "}
            <code className="bg-muted px-2 py-0.5 rounded text-xs">
              {appUrl}/api/webhooks/manychat
            </code>
          </Step>
          <Step n={3}>
            Add a header:{" "}
            <code className="bg-muted px-2 py-0.5 rounded text-xs">
              x-manychat-secret: YOUR_SECRET
            </code>
            (the value of MANYCHAT_WEBHOOK_SECRET in your .env).
          </Step>
          <Step n={4}>
            Set the request body (JSON) — copy the template from your
            Chatbots → [bot] page.
          </Step>
          <Step n={5}>
            Map the response field <code>reply</code> to a custom field, then
            add a <b>Send Message</b> step that posts that field back.
          </Step>
          <Step n={6}>
            Publish the flow and connect your Instagram page in ManyChat
            (Settings → Channels → Instagram).
          </Step>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
        {n}
      </div>
      <div>{children}</div>
    </div>
  );
}
