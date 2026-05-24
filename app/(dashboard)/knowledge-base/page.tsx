import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KnowledgeBaseForm } from "@/components/dashboard/kb-form";
import { KnowledgeBaseList } from "@/components/dashboard/kb-list";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
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
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add knowledge</CardTitle>
              <CardDescription>
                Each entry is a chunk of info — a single FAQ, a policy section,
                a product description, etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeBaseForm chatbots={chatbots} />
            </CardContent>
          </Card>

          <KnowledgeBaseList entries={entries ?? []} />
        </>
      )}
    </div>
  );
}
