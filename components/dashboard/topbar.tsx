"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, Search, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { AiLiveToggle } from "@/components/dashboard/ai-live-toggle";
import { BotSwitcher } from "@/components/dashboard/bot-switcher";
import type { WorkspaceBot } from "@/lib/workspace";

/**
 * The persistent top bar - desktop only (the mobile shell uses its own header
 * plus a bottom tab bar).
 *
 * It carries the two things the design insists must be visible on every screen:
 * which chatbot you are scoped to, and whether the AI is actually replying. The
 * page's own title, description and actions live in the header strip below this,
 * so nothing is stated twice.
 */
export function Topbar({
  bots,
  aiLive,
  userName,
  needsAttention,
  impersonating = false,
}: {
  bots: WorkspaceBot[];
  aiLive: boolean;
  userName: string | null;
  needsAttention: number;
  impersonating?: boolean;
}) {
  return (
    <header className="hidden h-[68px] shrink-0 items-center gap-4 border-b border-ss-line bg-white px-[30px] lg:flex">
      <BotSwitcher bots={bots} />
      <p className="hidden truncate text-[11.5px] leading-none text-ss-faint xl:block">
        Scopes Conversations, Follow-ups, Statistics &amp; Knowledge Base · ⌘K
        opens it
      </p>

      <div className="ml-auto flex items-center gap-3">
        <AiLiveToggle live={aiLive} botIds={bots.map((b) => b.id)} />

        <TopbarSearchLink />

        <Link
          href="/conversations"
          aria-label={
            needsAttention > 0
              ? `${needsAttention} conversations need attention`
              : "No conversations need attention"
          }
          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-ctl-lg border border-ss-line bg-ss-page text-ss-body transition-colors hover:border-ss-dash hover:text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
        >
          <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
          {needsAttention > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-2 top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-ss-rose"
            />
          )}
        </Link>

        <UserMenu name={userName} impersonating={impersonating} />
      </div>
    </header>
  );
}

/**
 * Search is a link rather than a live field: the inbox already owns thread
 * search with its filters attached, and a second half-working search box in the
 * chrome would be worse than one honest entry point. Shown only where there's
 * room for it without crowding the AI switch.
 */
function TopbarSearchLink() {
  return (
    <Link
      href="/conversations"
      className="hidden w-[210px] items-center gap-2 rounded-[10px] border border-ss-line bg-ss-page px-3 py-2.5 text-[12.5px] leading-none text-ss-faint transition-colors hover:border-ss-dash hover:text-ss-body 2xl:flex"
    >
      <Search className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
      Search leads or bots…
    </Link>
  );
}

function UserMenu({
  name,
  impersonating,
}: {
  name: string | null;
  impersonating: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const first = (name ?? "").trim().split(/\s+/)[0] || "Account";
  const initial = first.charAt(0).toUpperCase() || "?";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full border border-ss-line py-1 pl-1 pr-2.5 transition-colors hover:bg-ss-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-ss-navy font-display text-xs font-bold leading-none text-white">
          {initial}
        </span>
        <span className="max-w-[8rem] truncate text-[12.5px] font-semibold leading-none text-ss-ink">
          {first}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ss-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-chip border border-ss-rule bg-white py-1.5 shadow-ss-pop"
        >
          {!impersonating && (
            <>
              <MenuLink href="/settings" icon={<User className="h-4 w-4" />}>
                Profile
              </MenuLink>
              <MenuLink href="/billing" icon={<Settings className="h-4 w-4" />}>
                Plan &amp; billing
              </MenuLink>
              <div className="my-1.5 h-px bg-ss-hair" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                onMouseDown={signOut}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium leading-none text-ss-body transition-colors hover:bg-ss-page hover:text-ss-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </>
          )}
          {impersonating && (
            <p className="px-3.5 py-2.5 text-[11.5px] leading-snug text-ss-muted">
              You&apos;re viewing this workspace as its owner. Exit from the
              banner above to get back to your own account.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium leading-none text-ss-body transition-colors hover:bg-ss-page hover:text-ss-ink"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
