import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, MessageSquare, Zap, AlertCircle } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [
    { data: profile },
    { data: subscription },
    { count: chatbotCount },
    { count: kbCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("chatbots")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
    supabase
      .from("knowledge_base")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
  ]);

  // Usage this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: repliesThisMonth } = await supabase
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .eq("event_type", "ai_reply")
    .gte("created_at", monthStart.toISOString());

  const { count: conversationsCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user!.id);

  const subActive =
    subscription?.status === "active" || subscription?.status === "trialing";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening across your chatbots.
        </p>
      </div>

      {!subActive && (
        <Card className="mb-6 border-amber-500 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">
                Your subscription is not active yet
              </p>
              <p className="text-sm text-amber-700">
                Activate your $349/mo plan to start receiving AI replies.
              </p>
            </div>
            <Button asChild>
              <Link href="/billing">Activate</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chatbots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatbotCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">active assistants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversations</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversationsCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">total threads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              AI replies this month
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repliesThisMonth ?? 0}</div>
            <p className="text-xs text-muted-foreground">unlimited on your plan</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Finish these steps to put your AI replies live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StepRow
            done={subActive}
            label="Activate your $349/mo subscription"
            href="/billing"
          />
          <StepRow
            done={(chatbotCount ?? 0) > 0}
            label="Create your first chatbot"
            href="/chatbots/new"
          />
          <StepRow
            done={(kbCount ?? 0) > 0}
            label="Add knowledge base entries"
            href="/knowledge-base"
          />
          <StepRow
            done={(conversationsCount ?? 0) > 0}
            label="Connect ManyChat → Instagram"
            href="/settings"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StepRow({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md border">
      <div className="flex items-center gap-3">
        <Badge variant={done ? "success" : "outline"}>
          {done ? "Done" : "To do"}
        </Badge>
        <span className={done ? "text-muted-foreground line-through" : ""}>
          {label}
        </span>
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href={href}>{done ? "Review" : "Start"}</Link>
      </Button>
    </div>
  );
}
