import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ApartmentSettings } from "@/components/settings/ApartmentSettings";
import { CalendarViewSettings } from "@/components/settings/CalendarViewSettings";
import { UserManagement } from "@/components/settings/UserManagement";
import { AppLinkCard } from "@/components/settings/AppLinkCard";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [apartments, users] = await Promise.all([
    prisma.apartment.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { bookings: true } } },
    }),
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { _count: { select: { assignments: true } } },
    }),
  ]);

  const apartmentsBrief = apartments.map((a) => ({
    id: a.id,
    name: a.name,
    preferredCleanerId: a.preferredCleanerId ?? null,
    // gleiche Bedingung wie in sync.ts — nur solche Unterkünfte bekommen Aufträge
    live: a.active && a.smoobuId !== null,
  }));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>Einstellungen</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Unterkünfte, Benutzer und Ansichten verwalten</p>
      </div>

      {/* App-Link */}
      <AppLinkCard />

      <ApartmentSettings apartments={apartments} />
      <hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <UserManagement users={users} currentUserId={session.user.id} apartments={apartmentsBrief} />
      <hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <CalendarViewSettings />
    </div>
  );
}
