import { SidebarNav } from "@/components/dashboard/sidebar-nav";

/**
 * Desktop navigation rail — a fixed 16rem column, visible from `lg` up. On
 * smaller screens it is hidden and the same navigation is reached through the
 * mobile drawer ([mobile-nav.tsx]); both render the shared [SidebarNav].
 */
export function Sidebar({
  isSuperadmin = false,
  impersonating = false,
}: {
  isSuperadmin?: boolean;
  impersonating?: boolean;
}) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 h-full flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <SidebarNav isSuperadmin={isSuperadmin} impersonating={impersonating} />
    </aside>
  );
}
