import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { loadTodos, loadWeek } from "@/lib/todo";
import { loadOccupancy } from "@/lib/occupancy";
import { AdminTodoCard, AdminTodoSkeleton, AdminWeekCard, OccupancyCard } from "@/components/dashboard/admin/AdminOverview";

// Übersicht für Admin und Verwaltung (Entscheidung Mathias 31.10.2026):
// oben EINE Karte „Zu erledigen“ (nach Dringlichkeit), darunter „Diese Woche“.
// Keine Finanzzahlen — die Verwaltung sieht dasselbe. Seit 01.11.2026 im dunklen Stil (AdminOverview) für beide Rollen.

export const dynamic = "force-dynamic";

async function AdminTodos({ organizationId }: { organizationId: string }) {
  const r = await loadTodos(organizationId);
  return <AdminTodoCard items={r.items} chatsUnchecked={r.chatsUnchecked} />;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const orgId = session.user.organizationId;
  const now = new Date();

  const [orgInfo, week] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { lastSyncAt: true } }),
    loadWeek(orgId, now),
  ]);

  // Neue Übersicht im dunklen Stil — für Admin und Verwaltung (Entscheidung Mathias 01.11.2026)
  const occ = await loadOccupancy(orgId, now);
  const dayLabel = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", weekday: "long", day: "numeric", month: "long" }).format(now);
  const firstName = (session.user.name ?? "").split(" ")[0] || "";
  return (
    <div style={{ color: "#FFFFFF", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.64)" }}>{dayLabel}</span>
          <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            Guten Tag{firstName ? ", " : ""}
            {firstName && (
              <span style={{ fontWeight: 500, background: "linear-gradient(100deg,#99F6E4 0%,#2DD4BF 45%,#14B8A6 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{firstName}</span>
            )}
          </h1>
        </div>
      </div>
      <SyncButton lastSyncAt={orgInfo?.lastSyncAt?.toISOString() ?? null} />
      <Suspense fallback={<AdminTodoSkeleton />}>
        <AdminTodos organizationId={orgId} />
      </Suspense>
      <OccupancyCard occ={occ} />
      <AdminWeekCard days={week} />
    </div>
  );
}
