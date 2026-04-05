import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ApartmentSettings } from "@/components/settings/ApartmentSettings";
import { CalendarViewSettings } from "@/components/settings/CalendarViewSettings";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/my-jobs");

  const apartments = await prisma.apartment.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Einstellungen</h1>
        <p className="text-zinc-500 mt-1">Unterkünfte und Ansichten verwalten</p>
      </div>
      <ApartmentSettings apartments={apartments} />
      <CalendarViewSettings />
    </div>
  );
}
