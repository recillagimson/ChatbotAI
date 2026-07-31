/**
 * Dashboard navigation model - one source of truth for the desktop rail, the
 * mobile drawer and the mobile bottom tab bar, so the three can never drift.
 *
 * The design groups the rail into WORKSPACE (the things you do) and ACCOUNT (the
 * things you own), and hangs a live count off the three items that can be
 * "behind": unread conversations, waiting follow-ups, and the chatbot roster.
 * `badge` names which count an item reads, not a number - the counts are fetched
 * once per request in [lib/workspace.ts].
 */
import {
  LayoutGrid,
  Bot,
  MessagesSquare,
  SendHorizontal,
  BarChart3,
  BookOpen,
  GraduationCap,
  MessageSquareText,
  Sparkles,
  Settings,
  CreditCard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = "needsAttention" | "followups" | "chatbots";

export interface NavItem {
  href: string;
  label: string;
  /** Compact label for the mobile bottom bar, where five tabs share a row. */
  short?: string;
  icon: LucideIcon;
  badge?: NavBadge;
  /** Rose = "this is costing you money", amber = "this needs a minute". */
  badgeTone?: "rose" | "amber" | "muted";
}

export const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutGrid },
  {
    href: "/chatbots",
    label: "Chatbots",
    short: "Bots",
    icon: Bot,
    badge: "chatbots",
    badgeTone: "muted",
  },
  {
    href: "/conversations",
    label: "Conversations",
    short: "Inbox",
    icon: MessagesSquare,
    badge: "needsAttention",
    badgeTone: "rose",
  },
  {
    href: "/follow-ups",
    label: "Follow-ups",
    short: "Follow-ups",
    icon: SendHorizontal,
    badge: "followups",
    badgeTone: "amber",
  },
  { href: "/statistics", label: "Statistics", short: "Stats", icon: BarChart3 },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/feedback", label: "Feedback", icon: MessageSquareText },
  { href: "/requests", label: "Request Changes", icon: Sparkles },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
};

/**
 * The five tabs the design puts at thumb height on mobile. "Mobile is the
 * inbox", so Inbox and Follow-ups are one tap away and everything else lives
 * behind More.
 */
export const MOBILE_TABS: NavItem[] = [
  WORKSPACE_NAV[0], // Overview
  WORKSPACE_NAV[2], // Conversations
  WORKSPACE_NAV[3], // Follow-ups
  WORKSPACE_NAV[4], // Statistics
];

/**
 * While an admin is "viewing as" a client, the rail is scoped to what a client
 * would actually see - no Feedback, Settings, Billing or Admin. Unchanged from
 * the existing impersonation contract; the new routes join the allowed set.
 */
export const IMPERSONATION_HREFS = new Set([
  "/dashboard",
  "/chatbots",
  "/conversations",
  "/follow-ups",
  "/statistics",
  "/knowledge-base",
  "/learn",
  "/requests",
]);

/** Is this nav item the active one for the given pathname? */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Page title for a route - used by the mobile header and the document flow. */
export function navTitle(pathname: string): string {
  const all = [...WORKSPACE_NAV, ...ACCOUNT_NAV, ADMIN_NAV];
  const hit = all.find((i) => isNavActive(i.href, pathname));
  return hit?.label ?? "SpeedSettr";
}
