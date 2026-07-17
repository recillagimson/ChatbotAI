import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { KnowledgeBaseManager } from "@/components/dashboard/kb-manager";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [{ data: chatbots }, { data: entries }] = await Promise.all([
    supabase
      .from("chatbots")
      .select("id, name")
      .eq("user_id", user!.id)
      .order("created_at"),
    supabase
      .from("knowledge_base")
      .select("*, chatbots(name)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground">
          Teach your chatbot about your business. Add FAQ, policies, pricing,
          hours — anything the AI should know.
        </p>
      </div>

      {!chatbots?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Create a chatbot first to start adding knowledge.
          </CardContent>
        </Card>
      ) : (
        <KnowledgeBaseManager chatbots={chatbots} entries={entries ?? []} />
      )}
    </div>
  );
}
