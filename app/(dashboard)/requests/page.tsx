import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { RequestChat } from "@/components/dashboard/request-chat";
import { sectionColumnFor } from "@/lib/change-categories";
import type { ChangeCategory, ChangeProposal, Chatbot, TranscriptMessage } from "@/lib/types";
import { Plus, FolderClosed, History as HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CrStatus = "draft" | "pending" | "approved" | "applied" | "rejected";

// Client-facing status pills (soft pill + leading dot). A draft is always in the
// client's court (reply or submit) → "Needs your reply"; submitted = "In review";
// approved/applied (live) = "Approved"; rejected = "Declined".
const STATUS_META: Record<CrStatus, { label: string; pill: string; dot: string }> = {
  draft: {
    label: "Needs your reply",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  pending: {
    label: "In review",
    pill: "bg-green-50 text-green-700 ring-green-600/20",
    dot: "bg-green-500",
  },
  approved: {
    label: "Approved",
    pill: "bg-green-600 text-white ring-green-700/30",
    dot: "bg-white/90",
  },
  applied: {
    label: "Approved",
    pill: "bg-green-600 text-white ring-green-700/30",
    dot: "bg-white/90",
  },
  rejected: {
    label: "Declined",
    pill: "bg-red-50 text-red-700 ring-red-600/20",
    dot: "bg-red-500",
  },
};

function greetingFor(name: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; project?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: projectsData }, { data: historyData }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle(),
      supabase.from("chatbots").select("id, name").eq("user_id", user!.id).order("name"),
      supabase
        .from("change_requests")
        .select("id, title, status, chatbot_id, updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false }),
    ]);

  const projects = (projectsData ?? []) as { id: string; name: string }[];
  const history = (historyData ?? []) as {
    id: string;
    title: string | null;
    status: CrStatus;
    chatbot_id: string;
    updated_at: string;
  }[];

  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : null;
  const greeting = greetingFor(firstName);

  // Resolve the selected thread (only when ?id is present and owned by the user).
  type Thread = {
    id: string;
    chatbot_id: string;
    status: CrStatus;
    category: ChangeCategory;
    transcript: TranscriptMessage[];
    proposed: ChangeProposal | null;
    title: string | null;
  };
  let thread: Thread | null = null;
  if (sp.id) {
    const { data: cr } = await supabase
      .from("change_requests")
      .select("id, chatbot_id, status, category, transcript, proposed, title")
      .eq("id", sp.id)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (cr) {
      thread = cr as unknown as Thread;
    }
  }

  // Determine mode + the props the chat host needs.
  const isThread = !!thread;
  const activeProjectId = isThread
    ? thread!.chatbot_id
    : sp.project && projects.some((p) => p.id === sp.project)
      ? sp.project
      : null;
  const activeProjectName =
    projects.find((p) => p.id === activeProjectId)?.name ?? null;

  // Category: a loaded thread uses its stored category; a new request takes it
  // from the ?category= deep-link (the "Request a change" CTAs), else defaults.
  const isValidCategory = (v?: string): v is ChangeCategory =>
    v === "personality" || v === "offers" || v === "rebuttals" || v === "other";
  const activeCategory: ChangeCategory = thread
    ? thread.category
    : isValidCategory(sp.category)
      ? sp.category
      : "personality";

  // Current text of the targeted section for the active project (the "before"
  // side of the proposal review). Empty for "other" / no project / empty section.
  let currentSection = "";
  if (activeProjectId) {
    const col = sectionColumnFor(activeCategory);
    if (col) {
      const { data: secBot } = await supabase
        .from("chatbots")
        .select("persona_section, offers_section, rebuttals_section")
        .eq("id", activeProjectId)
        .eq("user_id", user!.id)
        .maybeSingle();
      currentSection = (secBot as Pick<Chatbot, typeof col> | null)?.[col] ?? "";
    }
  }

  // Sign user-message image paths + carry doc file names for a loaded thread.
  type ViewMessage = {
    role: "user" | "assistant";
    content: string;
    images?: { name: string; url: string | null }[];
    files?: { name: string }[];
  };
  let initialTranscript: ViewMessage[] = [];
  if (thread && Array.isArray(thread.transcript)) {
    initialTranscript = await Promise.all(
      thread.transcript.map(async (m): Promise<ViewMessage> => {
        const files = m.files?.length ? m.files.map((f) => ({ name: f.name })) : undefined;
        if (m.role === "user" && m.images && m.images.length) {
          const images = await Promise.all(
            m.images.map(async (im) => ({
              name: im.name,
              url: await signAttachment(supabase, im.path),
            }))
          );
          return { role: m.role, content: m.content, images, ...(files ? { files } : {}) };
        }
        return { role: m.role, content: m.content, ...(files ? { files } : {}) };
      })
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[260px_1fr] min-h-[100dvh]">
      {/* Left rail */}
      <aside className="hidden lg:flex flex-col border-r bg-muted/30">
        <div className="p-4">
          <Link
            href="/requests"
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !isThread && !activeProjectId && "border-primary/40"
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New request
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-6" aria-label="Requests navigation">
          <div>
            <p className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderClosed className="h-3.5 w-3.5" aria-hidden="true" />
              Projects
            </p>
            {projects.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Create a chatbot first.</p>
            ) : (
              <ul className="space-y-0.5">
                {projects.map((p) => {
                  const active = !isThread && activeProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/requests?project=${p.id}`}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex min-h-[40px] items-center rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <HistoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
              History
            </p>
            {history.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No requests yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {history.map((h) => {
                  const active = isThread && thread!.id === h.id;
                  const meta = STATUS_META[h.status] ?? STATUS_META.draft;
                  return (
                    <li key={h.id}>
                      <Link
                        href={`/requests?id=${h.id}`}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex min-h-[40px] items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {h.title || "Untitled request"}
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            meta.pill
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
                            aria-hidden="true"
                          />
                          {meta.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>
      </aside>

      {/* Center pane */}
      <RequestChat
        key={thread ? thread.id : `${activeProjectId ?? "new"}-${activeCategory}`}
        changeRequestId={thread ? thread.id : null}
        chatbotId={activeProjectId}
        projectName={activeProjectName}
        greeting={greeting}
        initialTranscript={initialTranscript}
        initialProposal={thread ? thread.proposed : null}
        initialStatus={thread ? thread.status : null}
        initialCategory={activeCategory}
        currentSection={currentSection}
        hasProjects={projects.length > 0}
      />
    </div>
  );
}
