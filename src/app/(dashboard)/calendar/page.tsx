import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";

export default async function CalendarPage() {
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
        checkOut: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      orderBy: { checkIn: "asc" },
      include: { apartment: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Kalender</h1>
      <CalendarGrid apartments={apartments} bookings={bookings} />
    </div>
  );
}
