"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
import type { SectionColumn } from "@/lib/types";

type Version = { id: string; created_at: string; author: string; chars: number; preview: string };

/**
 * The earlier versions of one prompt section, with View and Restore. Every change
 * to a section is recorded by the database (whoever made it), so a bad edit or a
 * bad published request can be undone here. Restoring keeps the current text in
 * the history too, so a restore can itself be undone.
 */
export function SectionHistory({
  chatbotId,
  section,
  label,
  onRestored,
}: {
  chatbotId: string;
  section: SectionColumn;
  label: string;
  /** Update the form's own copy of the text after a restore. */
  onRestored?: (content: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [canRestore, setCanRestore] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; content: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/section-versions?section=${section}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not load the history.");
        return;
      }
      setVersions(data.versions ?? []);
      setCanRestore(!!data.canRestore);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    setNotice(null);
    if (next) void load();
  }

  async function view(id: string) {
    if (viewing?.id === id) {
      setViewing(null);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/section-versions/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not open this version.");
        return;
      }
      setViewing({ id, content: data.content ?? "" });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function restore(v: Version) {
    if (
      !window.confirm(
        `Put this earlier ${label} back on the live bot? Any unsaved edits to this section on this page are replaced. The current text stays in the history, so you can undo this.`
      )
    ) {
      return;
    }
    setBusyId(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/section-versions/${v.id}/restore`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not restore this version.");
        return;
      }
      onRestored?.(typeof data?.content === "string" ? data.content : "");
      setNotice("Restored. The bot uses this text from its next reply.");
      setViewing(null);
      router.refresh();
      void load();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ss-indigo-600 transition-colors hover:text-ss-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? "Hide history" : "History"}
      </button>

      {open && (
        <div className="mt-2 rounded-md border px-3 py-3">
          {notice && (
            <p role="status" className="mb-2 text-xs text-ss-green-ink">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {loading ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Loading history...
            </p>
          ) : versions.length === 0 && !error ? (
            <p className="text-xs text-muted-foreground">
              No earlier versions yet. From now on, every change to this section is kept here.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {/* Each entry is the text as it was BEFORE a change: when it was
                        replaced, and who replaced it. */}
                    <span className="text-xs font-semibold text-foreground">
                      Replaced {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.author} changed it · {v.chars.toLocaleString()} characters
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => view(v.id)}
                        disabled={busyId !== null}
                        className="text-xs font-semibold text-ss-indigo-600 hover:text-ss-indigo-800 disabled:opacity-50"
                      >
                        {viewing?.id === v.id ? "Hide" : "View"}
                      </button>
                      {canRestore && (
                        <button
                          type="button"
                          onClick={() => restore(v)}
                          disabled={busyId !== null}
                          className="text-xs font-semibold text-ss-indigo-600 hover:text-ss-indigo-800 disabled:opacity-50"
                        >
                          {busyId === v.id ? "Restoring..." : "Restore"}
                        </button>
                      )}
                    </span>
                  </div>
                  {viewing?.id === v.id ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background px-3 py-2 text-xs">
                      {viewing.content || "(empty)"}
                    </pre>
                  ) : (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {v.preview || "(empty)"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!canRestore && versions.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The SpeedSettr team can put an earlier version back. Send a change request if you need one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
