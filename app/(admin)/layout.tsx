import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const admin = await requireSuperadmin();
  if (!admin) redirect("/dashboard"); // signed-in non-team users bounce to their app

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="p-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
