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
    <div className="min-h-screen flex">
      {/* Hintergrund-Gradient — hinter allem, alle Seiten */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: [
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(13,148,136,0.4) 0%, transparent 60%)",
            "radial-gradient(ellipse 60% 50% at 80% 20%, rgba(15,118,110,0.3) 0%, transparent 55%)",
            "radial-gradient(ellipse 70% 60% at 50% 80%, rgba(20,184,166,0.2) 0%, transparent 60%)",
            "linear-gradient(160deg, #020f0e 0%, #041f1c 40%, #051a18 100%)",
          ].join(", "),
        }}
      />

      {/* Sidebar – auf Mobilgerät versteckt */}
      <Sidebar role={session.user.role} />

      {/* Hauptbereich */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-60" style={{ position: "relative", zIndex: 1 }}>
        <Topbar userName={session.user.name ?? ""} role={session.user.role} />
        <main className="flex-1 p-4 pb-32 lg:p-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
