import { redirect } from "next/navigation";
import { createClient, getRealUser } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate + Admin-link decision use the REAL user; the page bodies below use the
  // effective (possibly impersonated) user via getCurrentUser.
  const user = await getRealUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  const { target, active } = await getImpersonation();
  const clientLabel = target?.full_name || target?.email || "client";

  return (
    // Pin the shell to the viewport so the SIDEBAR stays put and only the main
    // content scrolls. (min-h-screen let the row grow with content, which pushed
    // the page — and the sidebar — into a scroll.)
    <div className="flex h-[100dvh] overflow-hidden">
      {/* While impersonating: scope the sidebar to Overview→Request Changes and
          hide the Admin link (the real admin returns via the banner's Exit). */}
      <Sidebar isSuperadmin={!active && !!profile?.is_superadmin} impersonating={active} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {active && target && (
          <ImpersonationBanner clientLabel={clientLabel} clientId={target.id} />
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
