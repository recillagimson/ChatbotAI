"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionField } from "@/components/dashboard/section-field";
import type { Chatbot } from "@/lib/types";

export function ChatbotEditForm({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(chatbot.name);
  const [instagramUsername, setInstagramUsername] = useState(
    chatbot.instagram_username ?? ""
  );
  // Personality is the only section the owner edits directly. Fall back to the
  // legacy prompt fields if the backfill hasn't populated persona_section yet.
  const [persona, setPersona] = useState(
    chatbot.persona_section ?? chatbot.system_prompt ?? chatbot.business_description ?? ""
  );
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
        persona_section: persona.trim() || null,
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
      <div className="space-y-2">
        <Label htmlFor="edit-name">Chatbot name</Label>
        <Input
          id="edit-name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-ig">Instagram username (optional)</Label>
        <Input
          id="edit-ig"
          placeholder="acmecoffee"
          value={instagramUsername}
          onChange={(e) => {
            setInstagramUsername(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      {/* 1. Personality / Tone — directly editable. */}
      <SectionField
        id="edit-persona"
        label="Personality / Tone"
        value={persona}
        onChange={(next) => {
          setPersona(next);
          setSaved(false);
        }}
        rows={10}
        placeholder="Who the bot is and how it sounds — its name, voice, tone, and personality. e.g. 'You are Max, a warm, upbeat concierge for Acme…'"
        helper="This defines the bot's voice and identity. Upload a file (PDF, Word, or text) to drop its contents in, then edit. Safety rules and the knowledge base are added automatically."
      />

      {/* 2 & 3. Offers and Rebuttals — read-only here; changed via Request Change (team-reviewed). */}
      <ReadOnlySection
        title="Offers & services / inclusions & exclusions / links"
        value={chatbot.offers_section}
        category="offers"
      />
      <ReadOnlySection
        title="Rebuttals & FAQs"
        value={chatbot.rebuttals_section}
        category="rebuttals"
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

/**
 * Offers and Rebuttals are not editable here on purpose: those changes carry
 * commercial/factual risk and go through the team-reviewed Request Change flow.
 * We show the current content read-only with a CTA that opens a request
 * pre-scoped to this section.
 */
function ReadOnlySection({
  title,
  value,
  category,
}: {
  title: string;
  value: string | null;
  category: "offers" | "rebuttals";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{title}</Label>
        <Button asChild variant="outline" size="sm">
          <Link href={`/requests?category=${category}`}>Request a change</Link>
        </Button>
      </div>
      <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap min-h-[5rem] text-muted-foreground">
        {value?.trim() || "Not set yet — use “Request a change” to have the team add this section."}
      </div>
      <p className="text-xs text-muted-foreground">
        Edited through the team-reviewed Request Change flow, not here.
      </p>
    </div>
  );
}
