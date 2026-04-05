import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar – auf Mobilgerät versteckt */}
      <Sidebar role={session.user.role} />

      {/* Hauptbereich */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <Topbar userName={session.user.name ?? ""} role={session.user.role} />
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
