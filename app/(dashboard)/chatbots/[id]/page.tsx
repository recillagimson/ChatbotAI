import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatbotSettingsForm } from "@/components/dashboard/chatbot-settings-form";
import { ChatbotEditForm } from "@/components/dashboard/chatbot-edit-form";
import { ChangeRequestForm } from "@/components/dashboard/change-request-form";
import { ChangeRequestHistory } from "@/components/dashboard/change-request-history";
import { FOLLOWUP_ENABLED } from "@/lib/followup";
import type { Chatbot, ChangeRequest } from "@/lib/types";
import Link from "next/link";

export default async function ChatbotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!chatbot) notFound();

  const { count: kbCount } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("chatbot_id", id);

  const { count: convCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("chatbot_id", id);

  const { data: changeRequests } = await supabase
    .from("change_requests")
    .select("*")
    .eq("chatbot_id", id)
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/manychat`;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">{chatbot.name}</h1>
          <p className="text-muted-foreground">
            {chatbot.instagram_username
              ? `@${chatbot.instagram_username}`
              : "Not connected yet"}{" "}
            · Tone: {chatbot.tone}
          </p>
        </div>
        <Badge variant={chatbot.is_active ? "success" : "secondary"}>
          {chatbot.is_active ? "Active" : "Paused"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Knowledge entries</p>
            <p className="text-2xl font-display font-semibold tabular-nums">{kbCount ?? 0}</p>
            <Button asChild variant="link" className="p-0 h-auto mt-2">
              <Link href="/knowledge-base">Manage</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Conversations</p>
            <p className="text-2xl font-display font-semibold tabular-nums">{convCount ?? 0}</p>
            <Button asChild variant="link" className="p-0 h-auto mt-2">
              <Link href="/conversations">View inbox</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Edit chatbot</CardTitle>
          <CardDescription>
            Update the name, AI instructions, and tone. Changes apply to new
            replies right away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChatbotEditForm chatbot={chatbot as Chatbot} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Auto follow-up</CardTitle>
          <CardDescription>
            Automatically message contacts who stop replying.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {FOLLOWUP_ENABLED ? (
            <ChatbotSettingsForm chatbot={chatbot as Chatbot} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Coming soon. Instagram only lets us message a contact more than 24
              hours after their last message once they&apos;ve opted in to
              notifications — we&apos;re adding that opt-in next.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Request a change</CardTitle>
          <CardDescription>
            Tell the SpeedSettr team what to tweak — we&apos;ll draft it and
            apply it for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ChangeRequestForm chatbotId={chatbot.id} />
          <ChangeRequestHistory
            requests={(changeRequests ?? []) as ChangeRequest[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect ManyChat to this chatbot</CardTitle>
          <CardDescription>
            Paste these values into your ManyChat External Request action.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Webhook URL" value={webhookUrl} />
          <Field label="HTTP method" value="POST" />
          <Field label="Required header" value="x-manychat-secret: (the secret from your .env)" />
          <Field
            label="JSON body fields to send"
            value={`{
  "chatbot_id": "${chatbot.id}",
  "subscriber_id": "{{subscriber_id}}",
  "page_id": "{{page_id}}",
  "first_name": "{{first_name}}",
  "last_name": "{{last_name}}",
  "username": "{{ig_username}}",
  "message": "{{last_input_text}}"
}`}
          />
          <p className="text-sm text-muted-foreground">
            The reply will be returned in the JSON response as{" "}
            <code className="bg-muted px-1 rounded">reply</code>. Map that to a
            ManyChat custom field and send it back in the next step.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
        {label}
      </p>
      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}
