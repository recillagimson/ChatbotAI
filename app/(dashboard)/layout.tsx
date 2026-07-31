import { redirect } from "next/navigation";
import { createClient, getRealUser } from "@/lib/supabase/server";
import { getImpersonation } from "@/lib/impersonation";
import { getWorkspace } from "@/lib/workspace";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { Topbar } from "@/components/dashboard/topbar";
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

  // One read backs the rail badges, the chatbot switcher and the AI master
  // switch. Scope (`?bot=`) is a page-level concern, so the shell always shows
  // the whole workspace and each page narrows its own queries.
  const workspace = await getWorkspace(null);
  const bots = workspace?.bots ?? [];
  const counts = {
    chatbots: workspace?.counts.chatbots ?? 0,
    needsAttention: workspace?.counts.needsAttention ?? 0,
    followups: workspace?.counts.followups ?? 0,
  };
  const planNote = workspace?.subscriptionActive
    ? "Unlimited AI replies on every chatbot"
    : "Not active yet - activate to go live";

  return (
    // Pin the shell to the viewport so the SIDEBAR stays put and only the main
    // content scrolls. (min-h-screen let the row grow with content, which pushed
    // the page - and the sidebar - into a scroll.)
    <div data-app-shell className="flex h-[100dvh] overflow-hidden bg-ss-page">
      {/* While impersonating: scope the sidebar to Overview→Request Changes and
          hide the Admin link (the real admin returns via the banner's Exit). */}
      <Sidebar
        isSuperadmin={!active && !!profile?.is_superadmin}
        impersonating={active}
        counts={counts}
        planName={workspace?.planName}
        planNote={planNote}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav
          isSuperadmin={!active && !!profile?.is_superadmin}
          impersonating={active}
          bots={bots}
          aiLive={workspace?.aiLive ?? false}
          counts={counts}
          planName={workspace?.planName}
          planNote={planNote}
        />
        <Topbar
          bots={bots}
          aiLive={workspace?.aiLive ?? false}
          userName={workspace?.fullName ?? null}
          needsAttention={counts.needsAttention}
          impersonating={active}
        />
        {active && target && (
          <ImpersonationBanner clientLabel={clientLabel} clientId={target.id} />
        )}
        {/* pb-20 on mobile clears the fixed bottom tab bar. */}
        <main className="flex-1 overflow-hidden pb-[4.75rem] lg:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
