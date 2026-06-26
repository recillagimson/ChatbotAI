"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionField } from "@/components/dashboard/section-field";

/**
 * Admin editor for a client's chatbot. Mirrors the client's prompts view (the
 * three sections, same order/labels) but — unlike the client, who can only edit
 * Personality — the admin can edit ALL THREE sections (Personality, Offers,
 * Rebuttals). Saves directly to the live bot via the superadmin "admin all
 * chatbots" RLS overlay (browser createClient), no approval step.
 */
type AdminEditableChatbot = {
  id: string;
  name: string;
  instagram_username: string | null;
  is_active: boolean;
  persona_section: string | null;
  offers_section: string | null;
  rebuttals_section: string | null;
  // legacy fallback, only used to seed Personality if persona_section is empty
  system_prompt: string | null;
  business_description: string | null;
};

export function AdminChatbotEditForm({
  chatbot,
}: {
  chatbot: AdminEditableChatbot;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(chatbot.name);
  const [instagramUsername, setInstagramUsername] = useState(
    chatbot.instagram_username ?? ""
  );
  const [isActive, setIsActive] = useState(chatbot.is_active);
  const [persona, setPersona] = useState(
    chatbot.persona_section ?? chatbot.system_prompt ?? chatbot.business_description ?? ""
  );
  const [offers, setOffers] = useState(chatbot.offers_section ?? "");
  const [rebuttals, setRebuttals] = useState(chatbot.rebuttals_section ?? "");
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
        instagram_username: instagramUsername.trim() || null,
        is_active: isActive,
        persona_section: persona.trim() || null,
        offers_section: offers.trim() || null,
        rebuttals_section: rebuttals.trim() || null,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-xs text-muted-foreground">
        You&apos;re editing this on the client&apos;s behalf. Changes save directly
        to the live bot — no review needed.
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

      {/* Three sections — same order/labels as the client prompts view, all editable. */}
      <SectionField
        id={`edit-persona-${chatbot.id}`}
        label="Personality / Tone"
        value={persona}
        onChange={(next) => {
          setPersona(next);
          setSaved(false);
        }}
        rows={10}
        placeholder="Who the bot is and how it sounds — its name, voice, tone, and personality."
        helper="The bot's voice and identity. Safety rules and the knowledge base are added automatically."
      />
      <SectionField
        id={`edit-offers-${chatbot.id}`}
        label="Offers & services / inclusions & exclusions / links"
        value={offers}
        onChange={(next) => {
          setOffers(next);
          setSaved(false);
        }}
        rows={8}
        placeholder="What the business offers — services, packages, inclusions/exclusions, prices, and links."
        helper="Clients can't edit this directly — only the team can."
      />
      <SectionField
        id={`edit-rebuttals-${chatbot.id}`}
        label="Rebuttals & FAQs"
        value={rebuttals}
        onChange={(next) => {
          setRebuttals(next);
          setSaved(false);
        }}
        rows={8}
        placeholder="How the bot handles objections and frequently-asked questions."
        helper="Clients can't edit this directly — only the team can."
      />

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
