import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookingDetail } from "@/components/bookings/BookingDetail";

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const [booking, cleaners] = await Promise.all([
    prisma.booking.findFirst({
      where: { id: params.id, organizationId: session.user.organizationId },
      include: {
        apartment: {
          select: {
            name: true,
            color: true,
            laundryBedsDivisor: true,
            laundryTowelsPerGuest: true,
            laundryKitchenCount: true,
          },
        },
        cleaningAssignment: { include: { cleaner: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        role: "CLEANER",
        active: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!booking) notFound();

  return <BookingDetail booking={booking} cleaners={cleaners} />;
}
