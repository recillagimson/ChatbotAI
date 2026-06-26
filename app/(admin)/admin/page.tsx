import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ViewAsButton } from "@/components/admin/view-as-button";
import type { Profile, Subscription } from "@/lib/types";

type SubStatus = Subscription["status"];

function statusBadge(status: SubStatus | null) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "trialing":
      return <Badge variant="default">Trialing</Badge>;
    case "past_due":
      return <Badge variant="warning">Past due</Badge>;
    case "canceled":
      return <Badge variant="secondary">Canceled</Badge>;
    case "incomplete":
      return <Badge variant="destructive">Incomplete</Badge>;
    default:
      return <Badge variant="outline">No sub</Badge>;
  }
}

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const [{ data: profiles }, { data: subscriptions }, { data: chatbots }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, company_name, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("user_id, status, current_period_end"),
      supabase.from("chatbots").select("user_id"),
    ]);

  const profileRows = (profiles ?? []) as Pick<
    Profile,
    "id" | "email" | "full_name" | "company_name" | "created_at"
  >[];

  const subByUser = new Map<string, SubStatus>();
  for (const s of (subscriptions ?? []) as Pick<
    Subscription,
    "user_id" | "status" | "current_period_end"
  >[]) {
    subByUser.set(s.user_id, s.status);
  }

  const countByUser = new Map<string, number>();
  for (const c of (chatbots ?? []) as { user_id: string }[]) {
    countByUser.set(c.user_id, (countByUser.get(c.user_id) ?? 0) + 1);
  }

  const clients = profileRows.map((profile) => ({
    profile,
    status: subByUser.get(profile.id) ?? null,
    chatbotCount: countByUser.get(profile.id) ?? 0,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">
          Clients
        </h1>
        <p className="text-muted-foreground">
          {clients.length} {clients.length === 1 ? "account" : "accounts"}
        </p>
      </div>

      {clients.length === 0 ? (
        <p className="text-muted-foreground">No clients yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground font-medium">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground font-medium">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground font-medium">
                  Subscription
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground font-medium">
                  Chatbots
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground font-medium">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase text-muted-foreground font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map(({ profile, status, chatbotCount }) => (
                <tr key={profile.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clients/${profile.id}`}
                      className="font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                    >
                      {profile.full_name || profile.email}
                    </Link>
                    {profile.company_name && (
                      <div className="text-xs text-muted-foreground">
                        {profile.company_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{profile.email}</td>
                  <td className="px-4 py-3">{statusBadge(status)}</td>
                  <td className="px-4 py-3 tabular-nums">{chatbotCount}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ViewAsButton clientId={profile.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
