import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatisticsView } from "@/components/statistics/StatisticsView";

export default async function StatisticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const orgId = session.user.organizationId;

  const [apartments, bookings] = await Promise.all([
    prisma.apartment.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: "confirmed",
      },
      select: {
        id: true,
        guestName: true,
        guestCount: true,
        checkIn: true,
        checkOut: true,
        channelName: true,
        price: true,
        currency: true,
        apartmentId: true,
        apartment: { select: { name: true, color: true } },
      },
      orderBy: { checkIn: "desc" },
    }),
  ]);

  return <StatisticsView apartments={apartments} bookings={bookings} />;
}
