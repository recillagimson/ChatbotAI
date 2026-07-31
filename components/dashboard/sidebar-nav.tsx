"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LifeBuoy, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_CONTACTS, SUPPORT_HOURS } from "@/lib/support-contacts";
import {
  WORKSPACE_NAV,
  ACCOUNT_NAV,
  ADMIN_NAV,
  IMPERSONATION_HREFS,
  isNavActive,
  type NavItem,
} from "@/lib/nav";

export interface NavCounts {
  chatbots: number;
  needsAttention: number;
  followups: number;
}

/**
 * The navy rail's contents - brand lockup, the two nav groups, the plan card,
 * and the footer controls. No width or background of its own; the desktop rail
 * ([sidebar.tsx]) and the mobile drawer ([mobile-nav.tsx]) both supply those and
 * render this, so the two can't drift apart.
 *
 * `counts` come from the layout's single workspace read, so the badge beside
 * Conversations is the same number the inbox will show when it opens.
 */
export function SidebarNav({
  isSuperadmin = false,
  impersonating = false,
  counts,
  planName,
  planNote,
  onNavigate,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
  counts?: NavCounts;
  planName?: string;
  planNote?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const workspace = impersonating
    ? WORKSPACE_NAV.filter((i) => IMPERSONATION_HREFS.has(i.href))
    : WORKSPACE_NAV;
  const account = impersonating
    ? []
    : isSuperadmin
      ? [...ACCOUNT_NAV, ADMIN_NAV]
      : ACCOUNT_NAV;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Brand lockup - the bolt mark plus the italic wordmark and its
          micro-caps tagline, exactly as the logo spec sets it. */}
      <div className="flex shrink-0 items-center gap-2.5 px-5 pb-[22px] pt-[22px]">
        <Link
          href="/dashboard"
          aria-label="SpeedSettr"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-ctl-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-ctl-lg bg-ss-indigo">
            <BoltMark size={20} />
          </span>
          <span>
            <span className="block font-display text-[15.5px] font-extrabold italic leading-none tracking-[-0.01em] text-white">
              SPEEDSETTR
            </span>
            <span className="mt-[3px] block text-[6.5px] font-semibold leading-none tracking-[0.22em] text-ss-nav-dim">
              RAPID LEAD CONVERSION AI
            </span>
          </span>
        </Link>
      </div>

      <nav className="ss-scroll flex-1 overflow-y-auto px-4 pb-2">
        <GroupLabel>Workspace</GroupLabel>
        <div className="flex flex-col gap-[3px]">
          {workspace.map((item) => (
            <RailLink
              key={item.href}
              item={item}
              pathname={pathname}
              counts={counts}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {account.length > 0 && (
          <>
            <GroupLabel className="pt-5">Account</GroupLabel>
            <div className="flex flex-col gap-[3px]">
              {account.map((item) => (
                <RailLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  counts={counts}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="shrink-0 px-4 pb-[18px]">
        {planName && (
          <div className="mx-1 mb-3.5 rounded-[13px] border border-white/[.09] bg-white/[.06] px-3.5 py-3">
            <div className="flex items-center gap-[7px] font-display text-[11px] font-bold leading-none text-white">
              <span
                className="h-1.5 w-1.5 rounded-full bg-ss-mint"
                aria-hidden="true"
              />
              {planName.toUpperCase()} PLAN
            </div>
            {planNote && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-ss-nav-meta">
                {planNote}
              </p>
            )}
          </div>
        )}
        <HelpContact onNavigate={onNavigate} />
        {!impersonating && (
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-[13.5px] font-medium leading-none text-ss-nav-dim transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Sign out
          </button>
        )}
      </div>
    </>
  );
}

function GroupLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-3 pb-2.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.16em] text-ss-nav-label",
        className
      )}
    >
      {children}
    </div>
  );
}

function RailLink({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  counts?: NavCounts;
  onNavigate?: () => void;
}) {
  const active = isNavActive(item.href, pathname);
  const Icon = item.icon;
  const count = item.badge && counts ? counts[item.badge] : undefined;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-sm leading-none transition-colors",
        active
          ? "bg-ss-indigo font-semibold text-white shadow-ss-nav"
          : "font-medium text-ss-nav-text hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {count ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full font-display text-[10px] font-bold leading-none",
            item.badgeTone === "rose" && "bg-ss-rose px-[7px] py-[3px] text-white",
            item.badgeTone === "amber" && "bg-ss-amber px-[7px] py-[3px] text-white",
            item.badgeTone === "muted" &&
              cn("text-[12px]", active ? "text-ss-indigo-100" : "text-ss-nav-dim")
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The speed bolt from the logo spec, drawn as a path so it stays crisp at the
 * 18–21px the rail and the mobile header ask for.
 */
export function BoltMark({
  size = 21,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <polygon
        points="14,2 4,14.5 10.2,14.5 8.4,22.5 19.6,9.2 12.9,9.2 15.6,2"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Sidebar "Help" - a disclosure that reveals the SpeedSettr team's numbers as
 * tap-to-call links ([lib/support-contacts.ts]).
 */
function HelpContact({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {open && (
        <div className="mb-1.5 rounded-chip bg-white/5 p-2">
          <p className="px-1 pb-1.5 text-[11px] leading-none text-ss-nav-dim">
            Call or text the team
          </p>
          {SUPPORT_CONTACTS.map((c) => (
            <a
              key={c.tel}
              href={`tel:${c.tel}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-ctl px-2 py-2 text-[13px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-ss-indigo-300" aria-hidden="true" />
              <span className="font-semibold">@{c.name}</span>
              <span className="ml-auto tabular-nums text-ss-nav-dim">
                {c.phone}
              </span>
            </a>
          ))}
          <p className="px-1 pt-1.5 text-[11px] leading-none text-ss-nav-dim">
            Available {SUPPORT_HOURS}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-ctl-lg px-3 py-2.5 text-[13.5px] font-medium leading-none text-ss-nav-dim transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <LifeBuoy className="h-[18px] w-[18px]" aria-hidden="true" />
        Help
      </button>
    </div>
  );
}
