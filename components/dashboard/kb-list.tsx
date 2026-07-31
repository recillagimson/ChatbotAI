"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Check, X, Loader2 } from "lucide-react";

type Entry = {
  id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  chatbots: { name: string } | null;
  indexed?: boolean;
  needs_review?: boolean;
};

export function KnowledgeBaseList({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic delete: hide the row immediately, then confirm with the server.
  // Tracking removed ids (rather than a copy of the list) means the next server
  // refresh - which returns the list already without these rows - just works.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // Inline edit state: which entry is being edited + the working draft + status.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(e: Entry) {
    setEditingId(e.id);
    setDraftTitle(e.title);
    setDraftContent(e.content);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) {
      setEditError("Title and content can't be empty.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/knowledge-base/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError((data && data.error) || "Could not save changes.");
        setSaving(false);
        return;
      }
      setEditingId(null);
      setSaving(false);
      router.refresh();
    } catch {
      setEditError("Network error. Please try again.");
      setSaving(false);
    }
  }

  function remove(id: string) {
    if (!confirm("Delete this knowledge entry?")) return;
    setRemoved((s) => new Set(s).add(id));
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("knowledge_base")
        .delete()
        .eq("id", id);
      if (error) {
        setRemoved((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        return;
      }
      router.refresh();
    });
  }

  const visible = entries.filter((e) => !removed.has(e.id));

  if (!visible.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No knowledge entries yet. Add your first one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((e) => {
        const editing = editingId === e.id;
        return (
          <Card key={e.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    value={draftTitle}
                    onChange={(ev) => setDraftTitle(ev.target.value)}
                    maxLength={200}
                    disabled={saving}
                    aria-label="Entry title"
                    className="w-full rounded-md border bg-background px-2 py-1 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <CardTitle className="text-base">{e.title}</CardTitle>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{e.chatbots?.name ?? "-"}</Badge>
                  <Badge variant="outline">{e.source_type}</Badge>
                  {e.needs_review && (
                    <Badge variant="destructive">needs review</Badge>
                  )}
                  {e.indexed && <Badge variant="outline">indexed</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => saveEdit(e.id)}
                      disabled={saving}
                      aria-label="Save changes"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={cancelEdit}
                      disabled={saving}
                      aria-label="Cancel editing"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(e)}
                      aria-label="Edit entry"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(e.id)}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={draftContent}
                    onChange={(ev) => setDraftContent(ev.target.value)}
                    disabled={saving}
                    rows={10}
                    aria-label="Entry content"
                    className="min-h-[160px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {editError && (
                    <p role="alert" className="text-sm text-destructive">
                      {editError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Saving re-indexes this entry so the bot uses the edited text.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {e.content}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
