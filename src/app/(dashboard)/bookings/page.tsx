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
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>Buchungen</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Alle bestätigten Buchungen</p>
      </div>
      <BookingTable bookings={bookings} />
    </div>
  );
}
