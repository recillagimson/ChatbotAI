"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { KnowledgeBaseForm } from "@/components/dashboard/kb-form";
import { KnowledgeBaseList } from "@/components/dashboard/kb-list";
import { RetrainBotButton } from "@/components/dashboard/retrain-bot-button";

type Entry = {
  id: string;
  chatbot_id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  chatbots: { name: string } | null;
  indexed?: boolean;
  needs_review?: boolean;
};

/**
 * Owns the single "current chatbot" selection for the whole Knowledge Base page.
 * The add form writes to this chatbot AND the list below shows only this chatbot's
 * files - so switching the selector switches both. Previously the form had its own
 * dropdown while the list showed every chatbot's entries, so changing chatbots never
 * changed the visible files.
 */
export function KnowledgeBaseManager({
  chatbots,
  entries,
}: {
  chatbots: { id: string; name: string }[];
  entries: Entry[];
}) {
  const [chatbotId, setChatbotId] = useState(chatbots[0]?.id ?? "");

  const selected = chatbots.find((c) => c.id === chatbotId);
  const visibleEntries = entries.filter((e) => e.chatbot_id === chatbotId);

  return (
    <>
      {/* Shared selector - governs both the add form and the list below */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Chatbot</CardTitle>
          <CardDescription>
            New knowledge is added to this chatbot, and the files below are the
            ones it currently has.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="kb-chatbot">Working on</Label>
            <select
              id="kb-chatbot"
              value={chatbotId}
              onChange={(e) => setChatbotId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {chatbots.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {chatbotId && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
              <RetrainBotButton chatbotId={chatbotId} variant="outline" size="sm" />
              <p className="text-xs text-muted-foreground">
                Applies your latest knowledge edits to the bot and clears its caches.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add knowledge</CardTitle>
          <CardDescription>
            Each entry is a chunk of info - a single FAQ, a policy section, a
            product description, etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeBaseForm chatbotId={chatbotId} />
        </CardContent>
      </Card>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          Files for {selected?.name ?? "this chatbot"}
        </h2>
        <span className="text-sm text-muted-foreground">
          {visibleEntries.length} entr{visibleEntries.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <KnowledgeBaseList entries={visibleEntries} />
    </>
  );
}
