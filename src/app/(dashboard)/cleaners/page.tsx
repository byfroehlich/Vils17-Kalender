import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { CleanerList } from "@/components/cleaners/CleanerList";
import { CleaningSchedule } from "@/components/cleaners/CleaningSchedule";

export default async function CleanersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const orgId = session.user.organizationId;
  const now = new Date();
  const in60Days = addDays(now, 60);

  const [cleaners, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, role: "CLEANER" },
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    }),
    prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        booking: {
          status: "confirmed",
          checkOut: { gte: now, lte: in60Days },
        },
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        cleaner: { select: { name: true } },
        booking: {
          select: {
            id: true,
            guestName: true,
            guestCount: true,
            checkOut: true,
            apartment: {
              select: {
                name: true,
                color: true,
                laundryBedsDivisor: true,
                laundryTowelsPerGuest: true,
                laundryKitchenCount: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Reinigung</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Aufträge und Reinigungskräfte verwalten.</p>
      </div>

      <CleaningSchedule assignments={assignments} />

      {isAdmin && (
        <>
          <hr className="border-zinc-100" />
          <CleanerList cleaners={cleaners} />
        </>
      )}
    </div>
  );
}
