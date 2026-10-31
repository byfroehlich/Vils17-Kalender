import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { TodoCard, TodoCardSkeleton } from "@/components/dashboard/TodoCard";
import { WeekCard } from "@/components/dashboard/WeekCard";
import { loadTodos, loadWeek } from "@/lib/todo";

// Übersicht für Admin und Verwaltung (Entscheidung Mathias 31.10.2026):
// oben EINE Karte „Zu erledigen“ (nach Dringlichkeit), darunter „Diese Woche“.
// Keine Finanzzahlen — die Verwaltung sieht dasselbe.

export const dynamic = "force-dynamic";

const GERMAN_DAYS   = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const GERMAN_MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

async function Todos({ organizationId }: { organizationId: string }) {
  const r = await loadTodos(organizationId);
  return <TodoCard items={r.items} chatsUnchecked={r.chatsUnchecked} />;
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

  const dateStr = `${GERMAN_DAYS[now.getDay()]}, ${now.getDate()}. ${GERMAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const initials = (session.user.name ?? "V17")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={{ color: "rgba(255,255,255,0.95)" }}>
      {/* Header mit Sync-Stand */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: "rgba(255,255,255,0.95)" }}>Vils17</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>{dateStr}</p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <SyncButton lastSyncAt={orgInfo?.lastSyncAt?.toISOString() ?? null} />
          <div
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg, #0D9488, #0F766E)",
              border: "2px solid rgba(255,255,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
            }}
          >
            {initials}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Suspense fallback={<TodoCardSkeleton />}>
          <Todos organizationId={orgId} />
        </Suspense>
        <WeekCard days={week} />
      </div>
    </div>
  );
}
