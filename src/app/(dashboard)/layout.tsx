import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PushSubscriber } from "@/components/push/PushSubscriber";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { AutoRefresh } from "@/components/pwa/AutoRefresh";
import { ScrollMemory } from "@/components/layout/ScrollMemory";

/**
 * App-Rahmen wie bei einer nativen App: Der Rahmen ist fest in Bildschirmgröße,
 * das Fenster selbst scrollt NIE — nur der Inhaltsbereich (#app-scroll).
 *
 * Warum: Scrollt das ganze Fenster, verschiebt iOS es beim Öffnen der Tastatur
 * und setzt es in der installierten App teils nicht zurück. Topbar, Menü und
 * Hintergrund bleiben dann nach oben verrutscht hängen. Da das Fenster hier
 * immer auf 0 stehen muss, kann IosViewportFix es gefahrlos zurücksetzen.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex" style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* Hintergrund-Gradient — hinter allem, alle Seiten */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background: [
            "radial-gradient(ellipse 100% 70% at 10% 0%,  rgba(20,184,166,0.60) 0%, transparent 55%)",
            "radial-gradient(ellipse  75% 55% at 90% 10%, rgba(16,185,129,0.45) 0%, transparent 50%)",
            "radial-gradient(ellipse  85% 65% at 45% 90%, rgba(13,148,136,0.40) 0%, transparent 55%)",
            "linear-gradient(160deg, #0c3d38 0%, #1a6e63 40%, #104e48 100%)",
          ].join(", "),
        }}
      />

      {/* Sidebar – auf Mobilgerät versteckt */}
      <Sidebar role={session.user.role} />

      {/* Hauptbereich: Topbar fest oben, darunter der einzige scrollende Bereich */}
      <div className="flex-1 flex flex-col lg:ml-60 min-w-0" style={{ position: "relative", zIndex: 1, height: "100%" }}>
        <Topbar userName={session.user.name ?? ""} role={session.user.role} />
        <PushSubscriber />
        <AutoRefresh />
        <ScrollMemory />
        <main
          id="app-scroll"
          className="flex-1 px-4 pt-6 pb-32 lg:px-8 lg:pt-8 lg:pb-8"
          style={{
            overflowY: "auto",
            overflowX: "hidden",
            // Nachfedern bleibt im Inhaltsbereich — Leisten bewegen sich nicht mit
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            minHeight: 0,
          }}
        >
          <InstallPrompt />
          {children}
        </main>
      </div>
    </div>
  );
}
