import { Suspense } from "react";
import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signAttachment } from "@/lib/storage";
import { RequestChat } from "@/components/dashboard/request-chat";
import { sectionColumnFor } from "@/lib/change-categories";
import type { ChangeCategory, ChangeProposal, Chatbot, SectionColumn, TranscriptMessage } from "@/lib/types";
import { Plus, FolderClosed, History as HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SsDot } from "@/components/ss/controls";
import { requestsPaneKey } from "@/lib/requests-pane";
import { Sk, SkRows } from "@/components/ss/skeleton";

type CrStatus = "draft" | "pending" | "approved" | "applied" | "rejected";

// Client-facing status pills (soft pill + leading dot). A draft is always in the
// client's court (reply or submit) → "Needs your reply"; submitted = "In review";
// approved/applied (live) = "Approved"; rejected = "Declined".
const STATUS_META: Record<
  CrStatus,
  { label: string; tone: "amber" | "green" | "rose" }
> = {
  draft: { label: "Needs your reply", tone: "amber" },
  pending: { label: "In review", tone: "green" },
  approved: { label: "Approved", tone: "green" },
  applied: { label: "Applied", tone: "green" },
  rejected: { label: "Declined", tone: "rose" },
};

const PILL_TONE = {
  amber: "bg-ss-amber-bg text-ss-amber-ink",
  green: "bg-ss-green-bg text-ss-green-ink",
  rose: "bg-ss-rose-bg text-ss-rose-ink",
} as const;

function greetingFor(name: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

type RequestsParams = { id?: string; project?: string; category?: string };

/**
 * Request Changes: a rail of chatbots and past requests beside the open thread.
 *
 * Every control here changes only the query string, which never re-shows
 * loading.tsx. So the centre pane keys its own boundary (lib/requests-pane.ts
 * explains the key): switching to another request shows a pane skeleton at
 * once, instead of leaving the previous thread up with no sign anything is
 * happening until the new one has fully rendered.
 *
 * The rail stays OUTSIDE that boundary, so a click never remounts it and its
 * scroll position and keyboard focus survive; with the whole view keyed, every
 * History click threw the list back to the top. It reads only its own lists
 * and resolves the open request from them, never from the thread read, so it
 * does not wait on the thread.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<RequestsParams>;
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

  // The open request and its chatbot, for the rail's highlight. History is the
  // same user_id-scoped rows the pane reads the thread from, so this agrees with
  // the pane without waiting on it.
  const openRequest = sp.id ? (history.find((h) => h.id === sp.id) ?? null) : null;
  const activeProjectId = openRequest
    ? openRequest.chatbot_id
    : sp.project && projects.some((p) => p.id === sp.project)
      ? sp.project
      : null;

  const needsYou = history.filter((h) => h.status === "draft").length;

  return (
    <div className="flex h-full min-h-0 bg-ss-page">
      {/* ---- Left rail: new request, chatbot scope, history -------------- */}
      <aside className="hidden w-[286px] shrink-0 flex-col border-r border-ss-line bg-ss-surface lg:flex">
        <div className="p-3.5">
          <Link
            href="/requests"
            className={cn(
              "flex items-center justify-center gap-2 rounded-ctl-lg px-3 py-3 text-[13px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
              !openRequest && !activeProjectId
                ? "bg-ss-indigo text-ss-on-accent hover:bg-ss-indigo-600"
                : "border border-ss-line text-ss-ink hover:bg-ss-chip"
            )}
          >
            <Plus className="h-[17px] w-[17px]" aria-hidden="true" />
            New request
          </Link>
        </div>

        <nav
          className="ss-scroll flex-1 overflow-y-auto px-3.5 pb-6"
          aria-label="Requests navigation"
        >
          <p className="flex items-center gap-2 px-2 pb-2 pt-3 text-[9.5px] font-semibold uppercase leading-none tracking-[0.14em] text-ss-faint">
            <FolderClosed className="h-3.5 w-3.5" aria-hidden="true" />
            Chatbot
          </p>
          {projects.length === 0 ? (
            <p className="px-2 text-[11.5px] leading-relaxed text-ss-muted">
              Create a chatbot first - a change request always targets one.
            </p>
          ) : (
            <ul className="flex flex-col gap-[3px]">
              {projects.map((proj) => {
                const active = !openRequest && activeProjectId === proj.id;
                return (
                  <li key={proj.id}>
                    <Link
                      href={"/requests?project=" + proj.id}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-ctl px-3 py-2.5 text-[13px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
                        active
                          ? "bg-ss-indigo-50 font-bold text-ss-indigo-800"
                          : "font-medium text-ss-body hover:bg-ss-chip hover:text-ss-ink"
                      )}
                    >
                      <SsDot tone={active ? "green" : "idle"} className="h-1.5 w-1.5" />
                      <span className="truncate">{proj.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="flex items-center gap-2 px-2 pb-2 pt-5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.14em] text-ss-faint">
            <HistoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
            History
            {needsYou > 0 && (
              <span className="ml-auto rounded-full bg-ss-amber-bg px-[7px] py-0.5 text-[9.5px] font-bold leading-[1.6] text-ss-amber-ink">
                {needsYou} NEED YOU
              </span>
            )}
          </p>
          {history.length === 0 ? (
            <p className="px-2 text-[11.5px] leading-relaxed text-ss-muted">
              No requests yet. Describe a change in your own words and it comes
              back as an edit you can review before it goes live.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {history.map((h) => {
                const active = openRequest?.id === h.id;
                const meta = STATUS_META[h.status] ?? STATUS_META.draft;
                return (
                  <li key={h.id}>
                    <Link
                      href={"/requests?id=" + h.id}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "block rounded-ctl-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
                        active
                          ? "border-ss-indigo-200 bg-ss-indigo-50"
                          : "border-ss-hair hover:border-ss-line hover:bg-ss-chip"
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate text-[12.5px] leading-snug",
                          active ? "font-semibold text-ss-ink" : "font-medium text-ss-body"
                        )}
                      >
                        {h.title || "Untitled request"}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-[1.6]",
                            PILL_TONE[meta.tone]
                          )}
                        >
                          <SsDot tone={meta.tone} className="h-1 w-1" />
                          {meta.label}
                        </span>
                        <span className="ml-auto text-[10.5px] font-medium leading-none text-ss-faint">
                          {new Date(h.updated_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </aside>

      {/* ---- Center pane: the conversation and the proposed diff --------- */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ss-page-alt">
        <Suspense key={requestsPaneKey(sp)} fallback={<RequestsPaneSkeleton />}>
          <RequestsPane sp={sp} userId={user!.id} projects={projects} greeting={greeting} />
        </Suspense>
      </div>
    </div>
  );
}

/** The centre pane: the open thread, or the composer for a new request. */
async function RequestsPane({
  sp,
  userId,
  projects,
  greeting,
}: {
  sp: RequestsParams;
  userId: string;
  projects: { id: string; name: string }[];
  greeting: string;
}) {
  const supabase = await createClient();

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
      .eq("user_id", userId)
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
    v === "personality" || v === "offers" || v === "rebuttals" || v === "other" || v === "overall";
  const activeCategory: ChangeCategory = thread
    ? thread.category
    : isValidCategory(sp.category)
      ? sp.category
      : "personality";

  // Current text of the active project's sections - the "before" side of the
  // proposal review. `currentSection` is the single targeted section (single-section
  // categories); `currentSections` is all three, for the "overall" multi-diff.
  // Empty for no project / empty sections.
  let currentSection = "";
  let currentSections: Record<SectionColumn, string> = {
    persona_section: "",
    offers_section: "",
    rebuttals_section: "",
  };
  if (activeProjectId) {
    const { data: secBot } = await supabase
      .from("chatbots")
      .select("persona_section, offers_section, rebuttals_section")
      .eq("id", activeProjectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (secBot) {
      const bot = secBot as Pick<Chatbot, SectionColumn>;
      currentSections = {
        persona_section: bot.persona_section ?? "",
        offers_section: bot.offers_section ?? "",
        rebuttals_section: bot.rebuttals_section ?? "",
      };
      const col = sectionColumnFor(activeCategory);
      currentSection = col ? currentSections[col] : "";
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
    <RequestChat
      key={thread ? thread.id : (activeProjectId ?? "new") + "-" + activeCategory}
      changeRequestId={thread ? thread.id : null}
      chatbotId={activeProjectId}
      projectName={activeProjectName}
      greeting={greeting}
      initialTranscript={initialTranscript}
      initialProposal={thread ? thread.proposed : null}
      initialStatus={thread ? thread.status : null}
      initialCategory={activeCategory}
      currentSection={currentSection}
      currentSections={currentSections}
      hasProjects={projects.length > 0}
    />
  );
}

/**
 * The centre pane's skeleton while another request loads: loading.tsx's centre
 * half. The rail is already on screen beside it.
 */
function RequestsPaneSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
      <span className="sr-only">Loading the request</span>
      <div className="flex-none border-b border-ss-line bg-ss-surface px-6 py-4">
        <Sk className="h-[16px] w-40" />
        <Sk className="mt-2.5 h-[12px] w-32" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-ss-page-alt">
        <SkRows rows={4} avatar={false} />
      </div>
      <div className="flex-none border-t border-ss-line bg-ss-surface px-6 py-4">
        <Sk className="h-[76px] w-full rounded-ctl-lg" />
      </div>
    </div>
  );
}
