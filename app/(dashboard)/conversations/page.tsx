import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/dashboard/platform-badge";
import { formatDate, cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { PLATFORMS, PLATFORM_META, isPlatform } from "@/lib/platforms";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const sp = await searchParams;
  const platform = isPlatform(sp.platform) ? sp.platform : null;

  const supabase = await createClient();
  const user = await getCurrentUser();

  let query = supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("user_id", user!.id);
  if (platform) query = query.eq("platform", platform);
  const { data: conversations } = await query
    .order("last_message_at", { ascending: false })
    .limit(100);

  // Which platforms does this user actually have threads on? (for tab visibility)
  const { data: distinctRows } = await supabase
    .from("conversations")
    .select("platform")
    .eq("user_id", user!.id)
    .limit(1000);
  const present = new Set((distinctRows ?? []).map((r) => r.platform));
  // Always offer tabs for channels in use; if none recorded yet, show Instagram.
  const tabPlatforms = PLATFORMS.filter((p) => present.has(p));
  const tabs: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    ...(tabPlatforms.length ? tabPlatforms : ["instagram"]).map((p) => ({
      value: p,
      label: PLATFORM_META[p as keyof typeof PLATFORM_META].label,
    })),
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">Conversations</h1>
        <p className="text-muted-foreground">
          Every DM thread across your chatbots and channels. Click in to view or take over.
        </p>
      </div>

      {/* Platform tabs */}
      <nav aria-label="Filter by platform" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = platform === t.value || (!platform && t.value === null);
          return (
            <Link
              key={t.value ?? "all"}
              href={t.value ? `/conversations?platform=${t.value}` : "/conversations"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-input bg-background hover:bg-accent"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!conversations?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-muted-foreground">
              {platform
                ? `No ${PLATFORM_META[platform].label} conversations yet.`
                : "Once a real customer DMs you, the thread will show up here."}
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
                    <PlatformBadge platform={c.platform} showLabel={false} />
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
