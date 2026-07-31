import { SidebarNav, type NavCounts } from "@/components/dashboard/sidebar-nav";

/**
 * Desktop navigation rail - the 252px navy column from the design, fixed for the
 * life of the session. Hidden below `lg`, where the mobile shell's bottom tab
 * bar and More drawer take over.
 */
export function Sidebar({
  isSuperadmin = false,
  impersonating = false,
  counts,
  planName,
  planNote,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
  counts?: NavCounts;
  planName?: string;
  planNote?: string;
}) {
  return (
    <aside className="hidden h-full w-[252px] shrink-0 flex-col bg-ss-navy text-white lg:flex">
      <SidebarNav
        isSuperadmin={isSuperadmin}
        impersonating={impersonating}
        counts={counts}
        planName={planName}
        planNote={planNote}
      />
    </aside>
  );
}
