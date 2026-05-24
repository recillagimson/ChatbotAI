import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus } from "lucide-react";

export default async function ChatbotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: chatbots } = await supabase
    .from("chatbots")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Chatbots</h1>
          <p className="text-muted-foreground">
            One chatbot per Instagram or Messenger page you want to automate.
          </p>
        </div>
        <Button asChild>
          <Link href="/chatbots/new">
            <Plus className="h-4 w-4 mr-2" />
            New chatbot
          </Link>
        </Button>
      </div>

      {!chatbots?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium mb-1">No chatbots yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first chatbot to start automating DMs.
            </p>
            <Button asChild>
              <Link href="/chatbots/new">Create chatbot</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chatbots.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.instagram_username
                        ? `@${c.instagram_username}`
                        : "Not connected to Instagram yet"}
                    </CardDescription>
                  </div>
                  <Badge variant={c.is_active ? "success" : "secondary"}>
                    {c.is_active ? "Active" : "Paused"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {c.business_description || "No description yet"}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/chatbots/${c.id}`}>Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
