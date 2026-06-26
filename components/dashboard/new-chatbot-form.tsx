"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionField } from "@/components/dashboard/section-field";

/**
 * New-chatbot form. `ownerId` is the EFFECTIVE user id resolved on the server
 * (the impersonated client when an admin is "viewing as" them, otherwise the
 * real user) — we insert with it instead of the browser session id so a chatbot
 * created while impersonating belongs to the client, not the admin.
 */
export function NewChatbotForm({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chatbots")
      .insert({
        user_id: ownerId,
        name,
        persona_section: persona.trim() || null,
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

      <SectionField
        id="persona"
        label="Personality / Tone"
        value={persona}
        onChange={setPersona}
        rows={8}
        placeholder="Who the bot is and how it sounds. e.g. 'You are Max, a warm, upbeat concierge for Acme Coffee. Friendly, concise, one emoji max…'"
        helper="Upload a file (PDF, Word, or text) to drop its contents in, then edit. Detailed facts go in the knowledge base; offers and rebuttals are added after creation."
      />

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create chatbot"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
