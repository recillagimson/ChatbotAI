"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronsUpDown, LayoutGrid, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SsBotMark, SsCount, SsDot } from "@/components/ss/controls";
import type { WorkspaceBot } from "@/lib/workspace";

/**
 * The chatbot scope control.
 *
 * One chip in the top bar that says which bot you're looking at, and a popover
 * that switches it. Scope is a URL param (`?bot=`), not client state, so the
 * page you're on re-queries on the server and any view you share carries the
 * same scope. ⌘K / Ctrl-K opens it from anywhere, which is what makes working
 * several bots in a row bearable.
 *
 * Every row carries the two facts you need before you switch: whether that bot
 * is healthy, and how much is waiting on it.
 */
export function BotSwitcher(props: {
  bots: WorkspaceBot[];
  className?: string;
}) {
  // The switcher reads `?bot=` via useSearchParams, which needs a Suspense
  // boundary to keep the rest of the shell out of client-side bailout. The
  // fallback is the same chip at the same size, so nothing shifts.
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            "h-[38px] w-[220px] rounded-ctl-lg border border-ss-indigo-200 bg-ss-indigo-50",
            props.className
          )}
        />
      }
    >
      <BotSwitcherInner {...props} />
    </Suspense>
  );
}

function BotSwitcherInner({
  bots,
  className,
}: {
  bots: WorkspaceBot[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scope lives in the URL, and the switcher sits in the layout - which can't
  // read searchParams - so it resolves its own. An id that isn't in this user's
  // bot list falls back to "All chatbots" rather than showing a phantom scope.
  const requested = params.get("bot");
  const active = bots.find((b) => b.id === requested) ?? null;
  const scopedBotId = active?.id ?? null;
  const totalThreads = bots.reduce((s, b) => s + b.threads, 0);

  // ⌘K / Ctrl-K opens it; Escape closes. Skipped while the user is typing in
  // some other field, so it never steals a keystroke from the reply box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return setOpen(false);
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing && !open) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Click-away.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    inputRef.current?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function select(botId: string | null) {
    const next = new URLSearchParams(params.toString());
    if (botId) next.set("bot", botId);
    else next.delete("bot");
    // Switching scope invalidates any page cursor you were on.
    next.delete("page");
    const qs = next.toString();
    setOpen(false);
    setQuery("");
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const filtered = query.trim()
    ? bots.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
    : bots;

  if (bots.length === 0) {
    return (
      <Link
        href="/chatbots/new"
        className={cn(
          "flex items-center gap-2 rounded-ctl-lg border border-dashed border-ss-indigo-200 bg-ss-indigo-25 px-3 py-2 text-[12.5px] font-semibold leading-none text-ss-indigo-700 transition-colors hover:bg-ss-indigo-50",
          className
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create your first chatbot
      </Link>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-full items-center gap-2.5 rounded-ctl-lg border border-ss-indigo-200 bg-ss-indigo-50 px-3 py-2 transition-colors hover:bg-ss-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-1"
      >
        {active ? (
          <SsBotMark name={active.name} size={22} tone="solid" className="rounded-[7px]" />
        ) : (
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-ss-indigo-600 text-white">
            <LayoutGrid className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
        <span className="truncate text-[13px] font-bold leading-none text-ss-indigo-800">
          {active ? active.name : "All chatbots"}
        </span>
        <span className="hidden whitespace-nowrap text-[11.5px] font-medium leading-none text-[#6f6bd8] sm:inline">
          {(active ? active.threads : totalThreads).toLocaleString()} threads
        </span>
        <ChevronsUpDown
          className="h-4 w-4 shrink-0 text-ss-indigo-600"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a chatbot"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[352px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-ss-rule bg-white shadow-ss-pop"
        >
          <div className="border-b border-ss-hair p-3.5">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ss-line bg-ss-page px-2.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-ss-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a chatbot…"
                aria-label="Find a chatbot"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] leading-none text-ss-ink outline-none placeholder:text-ss-faint"
              />
              <kbd className="rounded-[5px] border border-ss-line bg-white px-1.5 py-0.5 text-[9.5px] font-semibold leading-[1.5] text-ss-muted">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="max-h-[19rem] overflow-auto p-2 ss-scroll">
            <div className="px-2 pb-[7px] pt-[5px] text-[9.5px] font-semibold uppercase leading-none tracking-[0.14em] text-ss-faint">
              Scope
            </div>

            <ScopeRow
              selected={!scopedBotId}
              onSelect={() => select(null)}
              mark={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl bg-ss-chip text-ss-body">
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              title="All chatbots"
              meta={`${totalThreads.toLocaleString()} threads combined`}
            />

            <div className="mx-2.5 my-[7px] h-px bg-ss-hair" aria-hidden="true" />

            {filtered.map((b) => (
              <ScopeRow
                key={b.id}
                selected={scopedBotId === b.id}
                onSelect={() => select(b.id)}
                mark={
                  <SsBotMark
                    name={b.name}
                    size={28}
                    tone={
                      scopedBotId === b.id
                        ? "solid"
                        : b.unconnected
                          ? "amber"
                          : "chip"
                    }
                    className="rounded-ctl"
                  />
                }
                title={
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{b.name}</span>
                    <SsDot
                      tone={
                        b.unconnected ? "amber" : b.is_active ? "green" : "idle"
                      }
                      className="h-1.5 w-1.5"
                    />
                  </span>
                }
                meta={botMeta(b)}
                metaTone={b.unconnected ? "amber" : undefined}
                trailing={
                  b.needsAttention > 0 ? (
                    <SsCount tone="rose">{b.needsAttention}</SsCount>
                  ) : undefined
                }
              />
            ))}

            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-ss-muted">
                No chatbot matches “{query}”.
              </p>
            )}
          </div>

          <Link
            href="/chatbots/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-t border-ss-hair bg-ss-page-alt px-4 py-3 transition-colors hover:bg-ss-page"
          >
            <Plus className="h-4 w-4 text-ss-indigo-600" aria-hidden="true" />
            <span className="text-[12.5px] font-semibold leading-none text-ss-indigo-600">
              New chatbot
            </span>
            <span className="ml-auto hidden text-[11px] leading-none text-ss-faint sm:inline">
              ↑↓ to move · ↵ to select
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function botMeta(b: WorkspaceBot): string {
  if (b.unconnected) return "No channel connected";
  const channels = b.platforms
    .map((p) => (p === "instagram" ? "IG" : p === "messenger" ? "FB" : p.slice(0, 2).toUpperCase()))
    .join(" · ");
  return `${channels} - ${b.threads.toLocaleString()} threads`;
}

function ScopeRow({
  selected,
  onSelect,
  mark,
  title,
  meta,
  metaTone,
  trailing,
}: {
  selected: boolean;
  onSelect: () => void;
  mark: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  metaTone?: "amber";
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-ctl-lg p-2.5 text-left transition-colors",
        selected ? "bg-ss-indigo-50" : "hover:bg-ss-page"
      )}
    >
      {mark}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] leading-none",
            selected
              ? "font-bold text-ss-indigo-800"
              : "font-semibold text-ss-ink"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "mt-1 block truncate text-[11px] leading-none",
            metaTone === "amber"
              ? "text-ss-amber-ink"
              : selected
                ? "text-[#6f6bd8]"
                : "text-ss-muted"
          )}
        >
          {meta}
        </span>
      </span>
      {trailing}
      {selected && !trailing ? (
        <Check className="h-[18px] w-[18px] shrink-0 text-ss-indigo-600" aria-hidden="true" />
      ) : null}
    </button>
  );
}
