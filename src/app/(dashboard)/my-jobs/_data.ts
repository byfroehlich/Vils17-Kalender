import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";

export async function getMyJobsData() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isCleaner = session.user.role === "CLEANER";
  const orgId = session.user.organizationId;
  const now = startOfDay(new Date());

  if (isCleaner) {
    const myAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        cleanerId: session.user.id,
        booking: { status: "confirmed" },
        OR: [
          { status: { in: ["ASSIGNED", "COMPLETED"] } },
          { status: "UNASSIGNED", cleanerUnavailable: true },
        ],
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        booking: { include: { apartment: true } },
        cleaner: { select: { name: true, cleanerRate: true } },
      },
    });

    const openAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        status: "UNASSIGNED",
        booking: { status: "confirmed", checkOut: { gte: now } },
        NOT: { cleanerId: session.user.id, cleanerUnavailable: true },
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        booking: { include: { apartment: true } },
      },
    });

    const enriched = await enrichWithNextGuests(orgId, myAssignments, openAssignments);

    return {
      myAssignments: enriched.my,
      openAssignments: enriched.open,
      isCleaner: true as const,
      userName: session.user.name ?? "",
    };
  }

  // Admin/Manager: alle Aufträge der Org
  const allAssignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: orgId,
      booking: { status: "confirmed" },
      OR: [
        { status: { in: ["ASSIGNED", "COMPLETED"] } },
        { status: "UNASSIGNED", cleanerUnavailable: true },
      ],
    },
    orderBy: { booking: { checkOut: "asc" } },
    include: {
      booking: { include: { apartment: true } },
      cleaner: { select: { name: true, cleanerRate: true } },
    },
  });

  const enriched = await enrichWithNextGuests(orgId, allAssignments, []);

  return {
    myAssignments: enriched.my,
    openAssignments: enriched.open as typeof allAssignments & { nextGuestCount: number | null }[],
    isCleaner: false as const,
    userName: session.user.name ?? "",
  };
}

async function enrichWithNextGuests<
  T extends { booking: { apartmentId: string; checkOut: Date } },
  U extends { booking: { apartmentId: string; checkOut: Date } },
>(orgId: string, my: T[], open: U[]) {
  const allAptIds = new Set([
    ...my.map((a) => a.booking.apartmentId),
    ...open.map((a) => a.booking.apartmentId),
  ]);

  if (allAptIds.size === 0) {
    return {
      my: my.map((a) => ({ ...a, nextGuestCount: null as number | null })),
      open: open.map((a) => ({ ...a, nextGuestCount: null as number | null })),
    };
  }

  // Alle zukünftigen Buchungen für die relevanten Wohnungen
  const futureBookings = await prisma.booking.findMany({
    where: {
      organizationId: orgId,
      status: "confirmed",
      apartmentId: { in: Array.from(allAptIds) },
    },
    select: { apartmentId: true, checkIn: true, guestCount: true },
    orderBy: { checkIn: "asc" },
  });

  function nextGuests(aptId: string, afterDate: Date): number | null {
    const found = futureBookings.find(
      (b) => b.apartmentId === aptId && new Date(b.checkIn) >= afterDate
    );
    return found?.guestCount ?? null;
  }

  return {
    my: my.map((a) => ({ ...a, nextGuestCount: nextGuests(a.booking.apartmentId, a.booking.checkOut) })),
    open: open.map((a) => ({ ...a, nextGuestCount: nextGuests(a.booking.apartmentId, a.booking.checkOut) })),
  };
}
