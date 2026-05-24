import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export default async function ConversationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("user_id", user!.id)
    .order("last_message_at", { ascending: false })
    .limit(100);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Conversations</h1>
        <p className="text-muted-foreground">
          Every DM thread across your chatbots. Click in to view or take over.
        </p>
      </div>

      {!conversations?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-muted-foreground">
              Once a real customer DMs you, the thread will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/conversations/${c.id}`}
                className="flex items-center gap-4 p-4 hover:bg-accent transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                  {(c.contact_name || c.contact_username || "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {c.contact_name || c.contact_username || "Unknown"}
                    </p>
                    {c.unread_count > 0 && (
                      <Badge variant="default">{c.unread_count}</Badge>
                    )}
                    {c.status === "ai_paused" && (
                      <Badge variant="warning">AI paused</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {(c.chatbots as { name: string } | null)?.name ?? "—"}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatDate(c.last_message_at)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
