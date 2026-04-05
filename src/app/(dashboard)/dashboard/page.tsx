import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { UpcomingBookings } from "@/components/dashboard/UpcomingBookings";
import { WarningBanner } from "@/components/dashboard/WarningBanner";
import { SyncButton } from "@/components/dashboard/SyncButton";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const orgId = session.user.organizationId;
  const now = new Date();
  const in7Days = addDays(now, 7);

  const in14Days = addDays(now, 14);

  const [upcomingCheckouts, upcomingCheckins, openCleanings, openLaundry, nextBookings, problemBookingsRaw] =
    await Promise.all([
      // Abreisen in 7 Tagen
      prisma.booking.count({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkOut: { gte: now, lte: in7Days },
        },
      }),
      // Ankünfte in 7 Tagen
      prisma.booking.count({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkIn: { gte: now, lte: in7Days },
        },
      }),
      // Offene Reinigungen: UNASSIGNED oder kein Assignment
      prisma.booking.count({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkOut: { gte: now, lte: in7Days },
          OR: [
            { cleaningAssignment: { status: "UNASSIGNED" } },
            { cleaningAssignment: null },
          ],
        },
      }),
      // Offene Wäsche: OPEN oder kein Assignment
      prisma.booking.count({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkOut: { gte: now, lte: in14Days },
          OR: [
            { cleaningAssignment: { laundryStatus: "OPEN" } },
            { cleaningAssignment: null },
          ],
        },
      }),
      // Nächste 10 Buchungen
      prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkOut: { gte: now },
        },
        orderBy: { checkOut: "asc" },
        take: 10,
        include: {
          apartment: true,
          cleaningAssignment: {
            include: { cleaner: true },
          },
        },
      }),
      // Problematische Buchungen in 14 Tagen (kein Assignment, UNASSIGNED, oder Wäsche OPEN)
      prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: "confirmed",
          checkIn: { gte: now, lte: in14Days },
          OR: [
            { cleaningAssignment: null },
            { cleaningAssignment: { status: "UNASSIGNED" } },
            { cleaningAssignment: { laundryStatus: "OPEN" } },
          ],
        },
        orderBy: { checkIn: "asc" },
        include: {
          apartment: { select: { name: true } },
          cleaningAssignment: { select: { status: true, laundryStatus: true } },
        },
      }),
    ]);

  const problemBookings = problemBookingsRaw.map((b) => ({
    id: b.id,
    guestName: b.guestName,
    checkIn: b.checkIn,
    apartment: b.apartment,
    cleaningUnassigned: b.cleaningAssignment?.status === "UNASSIGNED",
    laundryOpen: b.cleaningAssignment?.laundryStatus === "OPEN",
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Übersicht</h1>
          <p className="text-zinc-500 mt-1">Willkommen, {session.user.name}</p>
        </div>
        <SyncButton />
      </div>

      {/* Warnungen */}
      <WarningBanner bookings={problemBookings} />

      {/* Statistik-Karten */}
      <StatsCards
        upcomingCheckouts={upcomingCheckouts}
        upcomingCheckins={upcomingCheckins}
        openCleanings={openCleanings}
        openLaundry={openLaundry}
      />

      {/* Nächste Buchungen */}
      <section>
        <h2 className="text-2xl font-semibold text-zinc-900 mb-4">
          Nächste Buchungen
        </h2>
        <UpcomingBookings bookings={nextBookings} />
      </section>
    </div>
  );
}
