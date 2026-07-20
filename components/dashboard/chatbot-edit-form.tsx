"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionField } from "@/components/dashboard/section-field";
import { Textarea } from "@/components/ui/textarea";
import { clampDebounceSeconds, MIN_DEBOUNCE_SECONDS, MAX_DEBOUNCE_SECONDS } from "@/lib/debounce";
import type { Chatbot } from "@/lib/types";

export function ChatbotEditForm({
  chatbot,
  // Admins (superadmins) may edit Offers & Rebuttals directly here — both on their
  // own bots and while viewing a client (view-as). Regular owners keep the
  // read-only, team-reviewed Request Change flow. The write is authorized by the
  // "admin all chatbots" RLS overlay; this prop only unlocks the UI.
  canEditSections = false,
}: {
  chatbot: Chatbot;
  canEditSections?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(chatbot.name);
  const [instagramUsername, setInstagramUsername] = useState(
    chatbot.instagram_username ?? ""
  );
  // Personality is the only section the OWNER edits directly. Fall back to the
  // legacy prompt fields if the backfill hasn't populated persona_section yet.
  const [persona, setPersona] = useState(
    chatbot.persona_section ?? chatbot.system_prompt ?? chatbot.business_description ?? ""
  );
  // Offers/Rebuttals state is only wired into the form when canEditSections (admin).
  const [offers, setOffers] = useState(chatbot.offers_section ?? "");
  const [rebuttals, setRebuttals] = useState(chatbot.rebuttals_section ?? "");
  // Per-bot reply-wait window (seconds). String state so the field can be cleared
  // while typing; parsed + clamped on save. `?? 60` guards a pre-migration row
  // whose column hasn't loaded yet (matches the DB default).
  const [replyWait, setReplyWait] = useState<string>(
    String(chatbot.reply_debounce_seconds ?? 60)
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
        // Only an admin's form carries Offers/Rebuttals; a regular owner's save
        // must never touch these (they own the Request Change flow).
        ...(canEditSections && {
          offers_section: offers.trim() || null,
          rebuttals_section: rebuttals.trim() || null,
        }),
      })
      .eq("id", chatbot.id);
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }
    // Reply-wait is a SEPARATE best-effort write: a deploy-before-migration
    // window (the column may not exist yet) must not fail the whole save and
    // block a rename/persona edit. Mirrors the webhook's fail-open read. Clearing
    // the field keeps the current value (never silently 0).
    await supabase
      .from("chatbots")
      .update({
        reply_debounce_seconds: clampDebounceSeconds(
          replyWait.trim() === "" ? chatbot.reply_debounce_seconds ?? 60 : Number(replyWait)
        ),
      })
      .eq("id", chatbot.id);
    setSaving(false);
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

      <div className="space-y-2">
        <Label htmlFor="edit-reply-wait">Reply wait (seconds)</Label>
        <Input
          id="edit-reply-wait"
          type="number"
          inputMode="numeric"
          min={MIN_DEBOUNCE_SECONDS}
          max={MAX_DEBOUNCE_SECONDS}
          className="w-28"
          value={replyWait}
          onChange={(e) => {
            setReplyWait(e.target.value);
            setSaved(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          How long to wait for the lead to finish before replying, so several quick
          messages — or a photo sent with its caption — become ONE reply instead of a
          separate reply to each. The timer resets every time they send another
          message. {MIN_DEBOUNCE_SECONDS}–{MAX_DEBOUNCE_SECONDS}s; 0 replies
          immediately. Higher means fewer split replies but a slower first reply.
        </p>
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

      {/* 2 & 3. Offers and Rebuttals — read-only for owners (changed via Request
          Change, team-reviewed); directly editable for admins (own bots + view-as). */}
      {canEditSections ? (
        <>
          <SectionField
            id="edit-offers"
            label="Offers & services / inclusions & exclusions / links"
            value={offers}
            onChange={(next) => {
              setOffers(next);
              setSaved(false);
            }}
            rows={7}
            placeholder="Offers, services, what's included/excluded, pricing, and links."
            helper="Admin: editing directly — saves to the live bot, bypassing the Request Change review."
          />
          <SectionField
            id="edit-rebuttals"
            label="Rebuttals & FAQs"
            value={rebuttals}
            onChange={(next) => {
              setRebuttals(next);
              setSaved(false);
            }}
            rows={7}
            placeholder="Common objections and how to handle them, plus FAQs."
            helper="Admin: editing directly — saves to the live bot, bypassing the Request Change review."
          />
        </>
      ) : (
        <>
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
        </>
      )}

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
      {/* Read-only but resizable (like the Personality field), capped at 7 rows so a
          long section scrolls inside the box instead of stretching the whole page. */}
      <Textarea
        readOnly
        rows={7}
        value={value?.trim() || ""}
        placeholder="Not set yet — use “Request a change” to have the team add this section."
        className="resize-y bg-muted/40 text-muted-foreground"
      />
      <p className="text-xs text-muted-foreground">
        Edited through the team-reviewed Request Change flow, not here.
      </p>
    </div>
  );
}
