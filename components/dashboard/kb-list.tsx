"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SsCard } from "@/components/ss/card";
import { SsButton, SsChip } from "@/components/ss/controls";
import { Trash2, Pencil, Check, X, Loader2 } from "lucide-react";

type Entry = {
  id: string;
  title: string;
  /** First KB_PREVIEW_CHARS of the body, not the whole thing. The list used to
   *  carry every entry's full text; the editor now fetches it on demand. */
  content_preview: string;
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
  // The list only holds a preview, so opening the editor is now a round trip.
  // This is which entry that request is in flight for.
  const [loadingId, setLoadingId] = useState<string | null>(null);

  /**
   * Open the inline editor on the entry's REAL body. The list prop only carries
   * KB_PREVIEW_CHARS of it, so seeding the textarea from `content_preview` would
   * silently truncate the entry on the next save - the save sends whatever is in
   * the box. Hence the fetch, and hence the editor staying closed until it lands.
   */
  async function startEdit(e: Entry) {
    setEditError(null);
    setLoadingId(e.id);
    try {
      const res = await fetch(`/api/knowledge-base/${e.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const { content } = (await res.json()) as { content?: string };
      setDraftTitle(e.title);
      setDraftContent(content ?? "");
      setEditingId(e.id);
    } catch {
      // Opening the editor could not fail before this change, so say what went
      // wrong rather than opening an empty box the user would then save over.
      setEditError("Couldn't load this entry. Check your connection and try again.");
    } finally {
      setLoadingId(null);
    }
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
      // Same deferral as the dashboard shell: this delete is the only Supabase
      // call in the file, so a static import pulled the whole browser SDK into
      // the first load of /knowledge-base. The row is already hidden
      // optimistically above, and a failure restores it below.
      const { createClient } = await import("@/lib/supabase/client");
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
      <SsCard className="px-5 py-8 text-center text-sm text-ss-muted">
        No knowledge entries yet. Add your first one above.
      </SsCard>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((e) => {
        const editing = editingId === e.id;
        return (
          <SsCard key={e.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    value={draftTitle}
                    onChange={(ev) => setDraftTitle(ev.target.value)}
                    maxLength={200}
                    disabled={saving}
                    aria-label="Entry title"
                    className="w-full rounded-ctl border border-ss-line bg-ss-surface px-2 py-1 font-display text-[15px] font-bold text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
                  />
                ) : (
                  <h3 className="font-display text-[15px] font-bold leading-tight text-ss-ink">
                    {e.title}
                  </h3>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {e.chatbots?.name ? (
                    <span className="text-[11.5px] font-medium leading-none text-ss-muted">
                      {e.chatbots.name}
                    </span>
                  ) : null}
                  <SsChip tone="neutral">{e.source_type}</SsChip>
                  {e.needs_review && <SsChip tone="rose">needs review</SsChip>}
                  {e.indexed && <SsChip tone="green">indexed</SsChip>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editing ? (
                  <>
                    <SsButton
                      variant="ghost"
                      size="icon"
                      onClick={() => saveEdit(e.id)}
                      disabled={saving}
                      aria-label="Save changes"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 text-ss-green" />
                      )}
                    </SsButton>
                    <SsButton
                      variant="ghost"
                      size="icon"
                      onClick={cancelEdit}
                      disabled={saving}
                      aria-label="Cancel editing"
                    >
                      <X className="h-4 w-4" />
                    </SsButton>
                  </>
                ) : (
                  <>
                    <SsButton
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(e)}
                      disabled={loadingId === e.id}
                      aria-label="Edit entry"
                    >
                      {loadingId === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </SsButton>
                    <SsButton
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(e.id)}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-4 w-4 text-ss-rose" />
                    </SsButton>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3">
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={draftContent}
                    onChange={(ev) => setDraftContent(ev.target.value)}
                    disabled={saving}
                    rows={10}
                    aria-label="Entry content"
                    className="min-h-[160px] w-full resize-y rounded-ctl border border-ss-line bg-ss-surface px-3 py-2 text-sm leading-relaxed text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
                  />
                  {editError && (
                    <p role="alert" className="text-sm text-ss-rose-ink">
                      {editError}
                    </p>
                  )}
                  <p className="text-xs text-ss-muted">
                    Saving re-indexes this entry so the bot uses the edited text.
                  </p>
                </div>
              ) : (
                <>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-ss-body">
                    {e.content_preview}
                  </p>
                  {/* startEdit can now fail before the editor opens, and the error
                      block above only exists inside the editing branch. Without
                      this, a failed load would leave the pencil doing nothing with
                      no explanation. */}
                  {editError && editingId === null && (
                    <p role="alert" className="mt-2 text-sm text-ss-rose-ink">
                      {editError}
                    </p>
                  )}
                </>
              )}
            </div>
          </SsCard>
        );
      })}
    </div>
  );
}
