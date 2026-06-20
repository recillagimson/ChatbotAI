import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { signAttachment } from "@/lib/storage";
import { RequestChat } from "@/components/dashboard/request-chat";
import type { ChangeProposal, TranscriptMessage } from "@/lib/types";
import { Plus, FolderClosed, History as HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CrStatus = "draft" | "pending" | "approved" | "applied" | "rejected";

const STATUS_META: Record<CrStatus, { label: string; variant: BadgeProps["variant"] }> = {
  draft: { label: "Draft", variant: "secondary" },
  pending: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "warning" },
  applied: { label: "Applied", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

function greetingFor(name: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; project?: string }>;
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
    transcript: TranscriptMessage[];
    proposed: ChangeProposal | null;
    title: string | null;
  };
  let thread: Thread | null = null;
  if (sp.id) {
    const { data: cr } = await supabase
      .from("change_requests")
      .select("id, chatbot_id, status, transcript, proposed, title")
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

  // Sign user-message image paths for display in a loaded thread.
  type ViewMessage = {
    role: "user" | "assistant";
    content: string;
    images?: { name: string; url: string | null }[];
  };
  let initialTranscript: ViewMessage[] = [];
  if (thread && Array.isArray(thread.transcript)) {
    initialTranscript = await Promise.all(
      thread.transcript.map(async (m): Promise<ViewMessage> => {
        if (m.role === "user" && m.images && m.images.length) {
          const images = await Promise.all(
            m.images.map(async (im) => ({
              name: im.name,
              url: await signAttachment(supabase, im.path),
            }))
          );
          return { role: m.role, content: m.content, images };
        }
        return { role: m.role, content: m.content };
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
                        <Badge variant={meta.variant} className="shrink-0">
                          {meta.label}
                        </Badge>
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
        key={thread ? thread.id : activeProjectId ?? "new"}
        changeRequestId={thread ? thread.id : null}
        chatbotId={activeProjectId}
        projectName={activeProjectName}
        greeting={greeting}
        initialTranscript={initialTranscript}
        initialProposal={thread ? thread.proposed : null}
        initialStatus={thread ? thread.status : null}
        hasProjects={projects.length > 0}
      />
    </div>
  );
}
