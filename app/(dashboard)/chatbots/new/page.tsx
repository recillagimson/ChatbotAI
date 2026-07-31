import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewChatbotForm } from "@/components/dashboard/new-chatbot-form";

export default async function NewChatbotPage() {
  // Effective user - the impersonated client when an admin is "viewing as" them,
  // so the new chatbot is owned by the client, not the admin.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-display font-semibold tracking-tight mb-2">New chatbot</h1>
      <p className="text-muted-foreground mb-8">
        Give your chatbot a name and a personality. You can add offers, rebuttals,
        and knowledge after it&apos;s created.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Chatbot profile</CardTitle>
          <CardDescription>
            The personality defines who the bot is and how it sounds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewChatbotForm ownerId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
