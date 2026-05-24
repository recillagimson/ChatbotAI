"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewChatbotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<
    "friendly" | "professional" | "casual" | "enthusiastic"
  >("friendly");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("chatbots")
      .insert({
        user_id: user.id,
        name,
        business_description: description,
        tone,
        instagram_username: instagramUsername || null,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(`/chatbots/${data.id}`);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">New chatbot</h1>
      <p className="text-muted-foreground mb-8">
        Tell us about the business this chatbot will represent.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            This is what the AI will use to introduce itself and stay on-brand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Chatbot name</Label>
              <Input
                id="name"
                required
                placeholder="Acme Coffee Bot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ig">Instagram username (optional)</Label>
              <Input
                id="ig"
                placeholder="acmecoffee"
                value={instagramUsername}
                onChange={(e) => setInstagramUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Business description</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="We're a specialty coffee shop in Austin TX, open 7am–6pm daily. We sell whole-bean coffee, espresso drinks, and pastries..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A short paragraph. You&apos;ll add detailed FAQ as knowledge base
                entries on the next step.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Reply tone</Label>
              <select
                id="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="friendly">Friendly (default)</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="enthusiastic">Enthusiastic</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create chatbot"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
