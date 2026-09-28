import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { knowledgeRedirectTarget } from "@/lib/chatbot-tabs";

export const dynamic = "force-dynamic";

/**
 * The Knowledge Base used to be its own page with a chatbot picker. Knowledge
 * belongs to one bot, so it now lives in that bot's Prompt & Knowledge tab; this
 * route only forwards old links and bookmarks there. The rules (honour an owned
 * ?bot=, one bot goes straight there, several go to the roster) are in
 * knowledgeRedirectTarget.
 */
export default async function KnowledgeBaseRedirect({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const sp = await searchParams;
  // View-as aware: under "view as client" this is the client, so an admin lands
  // on the client's bot, not their own.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: bots } = await supabase
    .from("chatbots")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at");

  redirect(knowledgeRedirectTarget((bots ?? []).map((b) => b.id), sp.bot ?? null));
}
