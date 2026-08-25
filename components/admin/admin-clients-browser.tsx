"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { SsCard } from "@/components/ss/card";
import { EmptyState } from "@/components/ss/page";
import {
  ssPill,
  SsAvatar,
  SsButton,
  SsChip,
  SsLinkButton,
  SsStatus,
} from "@/components/ss/controls";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { hasActiveAccess, isComp, type AccessRow } from "@/lib/access";
import { num } from "@/lib/format";
import type { Subscription } from "@/lib/types";

/** One client row, serialisable so the server page can hand it to this client component. */
export interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  chatbotCount: number;
  access: AccessRow | null;
}

const PAGE_SIZE = 20;

type Tab = "all" | "active" | "inactive";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

// The same status -> label decisions as before, drawn with ss/* state pills. A dotted
// SsStatus reads as live state; a flat SsChip reads as a settled category.
function statusBadge(status: Subscription["status"] | null) {
  switch (status) {
    case "active":
      return <SsStatus tone="green">Active</SsStatus>;
    case "trialing":
      return <SsStatus tone="indigo">Trialing</SsStatus>;
    case "past_due":
      return <SsStatus tone="amber">Past due</SsStatus>;
    case "canceled":
      return <SsChip tone="neutral">Canceled</SsChip>;
    case "incomplete":
      return <SsStatus tone="rose">Incomplete</SsStatus>;
    default:
      return <SsChip tone="neutral">No sub</SsChip>;
  }
}

// Reflect real access, not the raw status: a lapsed comp keeps status='trialing'
// (no cron sweep), so it must not read as "Trialing".
function accessBadge(row: AccessRow | null) {
  if (isComp(row)) {
    return hasActiveAccess(row) ? (
      <SsStatus tone="green">Comp</SsStatus>
    ) : (
      <SsChip tone="neutral">Comp expired</SsChip>
    );
  }
  return statusBadge(row?.status ?? null);
}

/**
 * The admin Clients list, browsable in the client: an Active / Inactive / All tab split
 * (Inactive = expired comp, canceled, past due, incomplete, or no subscription), a
 * name/email/company search, and page-through. All filtering is in-browser over the full
 * set the server already loaded, so tabs and search are instant. Switching tab or typing a
 * search resets to page 1.
 */
export function AdminClientsBrowser({ clients }: { clients: AdminClientRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Resolve access once; the tab split and the badges both key off it.
  const rows = useMemo(
    () => clients.map((c) => ({ ...c, active: hasActiveAccess(c.access) })),
    [clients]
  );
  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows]);
  const counts: Record<Tab, number> = {
    all: rows.length,
    active: activeCount,
    inactive: rows.length - activeCount,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "active" && !r.active) return false;
      if (tab === "inactive" && r.active) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.company ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, tab, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp defensively: a shrinking filter could leave `page` past the end.
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function changeTab(next: Tab) {
    setTab(next);
    setPage(1);
  }
  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Tabs + search ------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Filter clients by access"
          className="flex flex-wrap items-center gap-2"
        >
          {TABS.map((t) => {
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => changeTab(t.key)}
                aria-pressed={selected}
                className={ssPill({ state: selected ? "active" : "idle" })}
              >
                {t.label}
                <span className="opacity-80"> · {num(counts[t.key])}</span>
              </button>
            );
          })}
        </nav>

        <div className="relative ml-auto w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ss-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Search name, email, or company"
            aria-label="Search clients"
            className="h-[38px] w-full rounded-ctl-lg border border-ss-line bg-white pl-9 pr-3 text-[13px] leading-none text-ss-ink placeholder:text-ss-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
          />
        </div>
      </div>

      {/* ---- Rows -------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No clients match">
          {query
            ? "Try a different search, or switch tabs."
            : "No clients in this tab."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pageRows.map((c) => (
            <SsCard key={c.id} className="flex items-center gap-3.5 px-5 py-3.5">
              <SsAvatar name={c.name} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="truncate font-display text-[14px] font-bold leading-tight text-ss-ink transition-colors hover:text-ss-indigo-600 focus-visible:text-ss-indigo-600 focus-visible:outline-none"
                  >
                    {c.name}
                  </Link>
                  {accessBadge(c.access)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-none text-ss-muted">
                  <span className="truncate">{c.email}</span>
                  {c.company ? (
                    <>
                      <span aria-hidden="true" className="text-ss-faint">
                        ·
                      </span>
                      <span className="truncate">{c.company}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <span className="hidden shrink-0 text-[11.5px] leading-none text-ss-muted sm:inline">
                {num(c.chatbotCount)} {c.chatbotCount === 1 ? "chatbot" : "chatbots"}
              </span>
              <span className="hidden shrink-0 text-[11.5px] leading-none text-ss-faint md:inline">
                Joined {new Date(c.createdAt).toLocaleDateString()}
              </span>

              <div className="flex shrink-0 items-center gap-3">
                <SsLinkButton
                  href={`/admin/clients/${c.id}`}
                  variant="outline"
                  size="sm"
                >
                  Open
                </SsLinkButton>
                <ViewAsButton clientId={c.id} />
              </div>
            </SsCard>
          ))}
        </div>
      )}

      {/* ---- Result count + pagination ----------------------------------- */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-[11.5px] leading-none text-ss-muted">
            {filtered.length === rows.length
              ? `${num(filtered.length)} client${filtered.length === 1 ? "" : "s"}`
              : `${num(filtered.length)} of ${num(rows.length)} client${rows.length === 1 ? "" : "s"}`}
          </span>
          {totalPages > 1 && (
            <div className="ml-auto flex items-center gap-2">
              <SsButton
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </SsButton>
              <span className="text-[12px] font-medium leading-none tabular-nums text-ss-body">
                Page {safePage} of {totalPages}
              </span>
              <SsButton
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage >= totalPages}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </SsButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
