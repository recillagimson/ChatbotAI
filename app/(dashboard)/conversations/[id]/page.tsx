import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ConversationActions } from "@/components/dashboard/conversation-actions";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  // mark read
  if (conversation.unread_count > 0) {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", id);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/conversations">
          <ArrowLeft className="h-4 w-4 mr-2" />
          All conversations
        </Link>
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {conversation.contact_name ||
              conversation.contact_username ||
              "Unknown contact"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {(conversation.chatbots as { name: string } | null)?.name ?? "—"}
            {conversation.contact_username
              ? ` · @${conversation.contact_username}`
              : ""}
          </p>
        </div>
        <Badge
          variant={
            conversation.status === "active"
              ? "success"
              : conversation.status === "ai_paused"
                ? "warning"
                : "secondary"
          }
        >
          {conversation.status === "ai_paused"
            ? "AI paused"
            : conversation.status}
        </Badge>
      </div>

      <ConversationActions
        conversationId={conversation.id}
        currentStatus={conversation.status}
      />

      <Card className="mt-6">
        <CardContent className="p-4 space-y-3">
          {!messages?.length && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet.
            </p>
          )}
          {messages?.map((m) => {
            const fromCustomer = m.role === "user";
            return (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  fromCustomer ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2",
                    fromCustomer
                      ? "bg-secondary"
                      : m.role === "human_agent"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-primary text-primary-foreground"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  <p
                    className={cn(
                      "text-[10px] mt-1 opacity-70",
                      fromCustomer ? "text-muted-foreground" : ""
                    )}
                  >
                    {m.role === "human_agent"
                      ? "You · "
                      : m.role === "assistant"
                        ? "AI · "
                        : ""}
                    {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
