import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FollowupSequenceForm } from "@/components/dashboard/followup-sequence-form";
import { FollowupAssetManager } from "@/components/dashboard/followup-asset-manager";
import { ChatbotEditForm } from "@/components/dashboard/chatbot-edit-form";
import { ManychatKeyField } from "@/components/dashboard/manychat-key-field";
import { WebhookSecretField } from "@/components/dashboard/webhook-secret-field";
import { FOLLOWUP_ENABLED } from "@/lib/followup";
import type { Chatbot, FollowupAsset } from "@/lib/types";
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

  const apiKeySet = !!chatbot.manychat_api_key_enc;
  // Never serialize the encrypted key to the browser; the client forms don't use it.
  const safeChatbot = { ...chatbot, manychat_api_key_enc: null } as Chatbot;

  const { count: kbCount } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("chatbot_id", id);

  const { count: convCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("chatbot_id", id);

  const { data: followupAssets } = await supabase
    .from("followup_assets")
    .select("id, chatbot_id, user_id, key, label, description, kind, storage_path, url, mime, created_at")
    .eq("chatbot_id", id)
    .order("created_at", { ascending: true });
  const assets = (followupAssets ?? []) as FollowupAsset[];

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
          <ChatbotEditForm chatbot={safeChatbot} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Follow-up assets</CardTitle>
          <CardDescription>
            Pictures, voice notes, videos, and links you can attach to follow-up steps
            or let the AI send during a chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FollowupAssetManager
            chatbotId={chatbot.id}
            userId={user!.id}
            assets={assets}
            usedKeys={(safeChatbot.auto_followup_steps ?? [])
              .map((s) => s.asset_key ?? "")
              .filter(Boolean)}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Auto follow-up</CardTitle>
          <CardDescription>
            A timed sequence that re-engages contacts who stop replying, escalating with
            media until they convert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {FOLLOWUP_ENABLED ? (
            <FollowupSequenceForm chatbot={safeChatbot} assets={assets} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Auto follow-up is currently disabled for this deployment.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>ManyChat API key</CardTitle>
          <CardDescription>The key SpeedSettr uses to send replies from this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManychatKeyField chatbotId={chatbot.id} configured={apiKeySet} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect ManyChat to this chatbot</CardTitle>
          <CardDescription>
            Paste these values into your ManyChat External Request action. Build one
            flow per channel (Instagram, Facebook, WhatsApp, Telegram, TikTok) and set
            the <code className="bg-muted px-1 rounded">platform</code> value in each.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Webhook URL" value={webhookUrl} />
          <Field label="HTTP method" value="POST" />
          <Field label="Required header (name)" value="x-manychat-secret" />
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Secret value (this chatbot)</p>
            <WebhookSecretField chatbotId={chatbot.id} secret={chatbot.webhook_secret} />
          </div>
          <Field
            label="JSON body fields to send"
            value={`{
  "chatbot_id": "${chatbot.id}",
  "platform": "instagram",
  "subscriber_id": "{{user_id}}",
  "username": "{{user_name}}",
  "first_name": "{{first_name}}",
  "message": "{{last_input_text}}"
}`}
          />
          <p className="text-sm text-muted-foreground">
            Set <code className="bg-muted px-1 rounded">platform</code> to the channel
            this flow runs on — one of{" "}
            <code className="bg-muted px-1 rounded">instagram</code>,{" "}
            <code className="bg-muted px-1 rounded">messenger</code> (Facebook),{" "}
            <code className="bg-muted px-1 rounded">whatsapp</code>,{" "}
            <code className="bg-muted px-1 rounded">telegram</code>, or{" "}
            <code className="bg-muted px-1 rounded">tiktok</code>. Use that channel&apos;s
            username variable (e.g. <code className="bg-muted px-1 rounded">{"{{ig_username}}"}</code> on
            Instagram).
          </p>
          <p className="text-sm text-muted-foreground">
            For Instagram, Facebook, WhatsApp &amp; Telegram the reply is delivered
            automatically — no extra step needed.{" "}
            <span className="font-medium">TikTok</span> can&apos;t receive API pushes yet,
            so for the TikTok flow map the response field{" "}
            <code className="bg-muted px-1 rounded">reply</code> to a custom field and add
            a Send Message step.
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
