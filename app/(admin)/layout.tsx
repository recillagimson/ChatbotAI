import { redirect } from "next/navigation";
import { getRealUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/admin-nav";

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

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
