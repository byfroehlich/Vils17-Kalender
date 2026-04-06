import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookingTable } from "@/components/bookings/BookingTable";

export default async function BookingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const bookings = await prisma.booking.findMany({
    where: {
      organizationId: session.user.organizationId,
      status: "confirmed",
      checkOut: { gte: new Date() },
    },
    orderBy: { checkOut: "asc" },
    include: {
      apartment: true,
      cleaningAssignment: { include: { cleaner: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">Buchungen</h1>
      <BookingTable bookings={bookings} />
    </div>
  );
}
