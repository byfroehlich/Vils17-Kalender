import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ApartmentSettings } from "@/components/settings/ApartmentSettings";
import { CalendarViewSettings } from "@/components/settings/CalendarViewSettings";
import { UserManagement } from "@/components/settings/UserManagement";
import { AppLinkCard } from "@/components/settings/AppLinkCard";
import { EmailImportCard } from "@/components/settings/EmailImportCard";

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

      <EmailImportCard />

      <Link
        href="/settings/schnittstelle"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: "14px 18px", textDecoration: "none" }}
      >
        <span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Claude-Schnittstelle</span>
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Zugangstoken für Claude verwalten</span>
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
      </Link>

      <ApartmentSettings
        apartments={apartments}
        cleaners={users.filter((u) => u.role === "CLEANER").map((u) => ({ id: u.id, name: u.name }))}
      />
      <hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <UserManagement users={users} currentUserId={session.user.id} apartments={apartmentsBrief} />
      <hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <CalendarViewSettings />
    </div>
  );
}
