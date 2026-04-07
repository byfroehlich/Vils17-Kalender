import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ApartmentSettings } from "@/components/settings/ApartmentSettings";
import { CalendarViewSettings } from "@/components/settings/CalendarViewSettings";
import { UserManagement } from "@/components/settings/UserManagement";

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Einstellungen</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Unterkünfte, Benutzer und Ansichten verwalten</p>
      </div>
      <ApartmentSettings apartments={apartments} />
      <hr className="border-zinc-100" />
      <UserManagement users={users} currentUserId={session.user.id} />
      <hr className="border-zinc-100" />
      <CalendarViewSettings />
    </div>
  );
}
