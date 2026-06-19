"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Chatbot } from "@/lib/types";

type Tone = Chatbot["tone"];

type AdminEditableChatbot = {
  id: string;
  name: string;
  business_description: string | null;
  tone: Tone;
  system_prompt: string | null;
  instagram_username: string | null;
  is_active: boolean;
};

export function AdminChatbotEditForm({
  chatbot,
}: {
  chatbot: AdminEditableChatbot;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(chatbot.name);
  const [description, setDescription] = useState(
    chatbot.business_description ?? ""
  );
  const [tone, setTone] = useState<Tone>(chatbot.tone);
  const [systemPrompt, setSystemPrompt] = useState(chatbot.system_prompt ?? "");
  const [instagramUsername, setInstagramUsername] = useState(
    chatbot.instagram_username ?? ""
  );
  const [isActive, setIsActive] = useState(chatbot.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError("Chatbot name is required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({
        name: name.trim(),
        business_description: description.trim() || null,
        tone,
        system_prompt: systemPrompt.trim() || null,
        instagram_username: instagramUsername.trim() || null,
        is_active: isActive,
      })
      .eq("id", chatbot.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        You&apos;re editing this on the client&apos;s behalf.
      </p>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor={`active-${chatbot.id}`}>Bot active</Label>
          <p className="text-xs text-muted-foreground">
            Pause or activate this client&apos;s bot.
          </p>
        </div>
        <Switch
          id={`active-${chatbot.id}`}
          checked={isActive}
          onCheckedChange={(checked) => {
            setIsActive(checked);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-name-${chatbot.id}`}>Chatbot name</Label>
        <Input
          id={`edit-name-${chatbot.id}`}
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-ig-${chatbot.id}`}>
          Instagram username (optional)
        </Label>
        <Input
          id={`edit-ig-${chatbot.id}`}
          placeholder="acmecoffee"
          value={instagramUsername}
          onChange={(e) => {
            setInstagramUsername(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-description-${chatbot.id}`}>
          Business description / AI instructions
        </Label>
        <Textarea
          id={`edit-description-${chatbot.id}`}
          rows={6}
          placeholder="We're a specialty coffee shop in Austin TX, open 7am–6pm daily..."
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setSaved(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          This is the core instruction the AI uses to introduce itself and stay
          on-brand. Detailed facts (hours, pricing, policies) go in the
          knowledge base.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-tone-${chatbot.id}`}>Reply tone</Label>
        <select
          id={`edit-tone-${chatbot.id}`}
          value={tone}
          onChange={(e) => {
            setTone(e.target.value as Tone);
            setSaved(false);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="friendly">Friendly</option>
          <option value="professional">Professional</option>
          <option value="casual">Casual</option>
          <option value="enthusiastic">Enthusiastic</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-system-prompt-${chatbot.id}`}>
          System prompt / persona (advanced)
        </Label>
        <Textarea
          id={`edit-system-prompt-${chatbot.id}`}
          rows={10}
          placeholder="Paste a full persona prompt here (e.g. a named character with its own voice and rules)."
          value={systemPrompt}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            setSaved(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          When set, this overrides the business description and reply tone above
          and becomes the bot&apos;s full instructions. The knowledge base is
          still appended automatically. Leave blank to use the description and
          tone instead.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
    </form>
  );
}
