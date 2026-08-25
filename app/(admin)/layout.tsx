import { redirect } from "next/navigation";
import { createClient, getRealUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { AdminSidebar, AdminMobileHeader } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate on the REAL user, never an impersonated client (a superadmin can be
  // "viewing as" a client and must still reach /admin).
  const user = await getRealUser();
  if (!user) redirect("/login");
  const admin = await requireSuperadmin();
  if (!admin) redirect("/dashboard"); // signed-in non-team users bounce to their app

  // Rail badges: work waiting across all clients. Head-only counts (superadmin RLS
  // sees every row). Best-effort - a count failure just hides the badge.
  const supabase = await createClient();
  const [{ count: requests }, { count: feedback }] = await Promise.all([
    supabase
      .from("change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);
  const counts = { requests: requests ?? 0, feedback: feedback ?? 0 };

  return (
    // Pin the shell to the viewport so the rail stays put and only the main
    // content scrolls - the same model as the client dashboard shell.
    <div data-app-shell className="flex h-[100dvh] overflow-hidden bg-ss-page">
      <AdminSidebar counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminMobileHeader counts={counts} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
