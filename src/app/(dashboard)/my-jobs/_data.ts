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
    // Meine zugesagten/erledigten Aufträge
    const myAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        cleanerId: session.user.id,
        status: { in: ["ASSIGNED", "COMPLETED"] },
        booking: { status: "confirmed" },
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        booking: { include: { apartment: true } },
        cleaner: { select: { name: true, cleanerRate: true } },
      },
    });

    // Alle offenen Aufträge (nicht zugewiesen) — für die Auktion
    const openAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        status: "UNASSIGNED",
        cleanerId: null,
        booking: { status: "confirmed", checkOut: { gte: now } },
      },
      orderBy: { booking: { checkOut: "asc" } },
      include: {
        booking: { include: { apartment: true } },
      },
    });

    return {
      myAssignments,
      openAssignments,
      isCleaner: true as const,
      userName: session.user.name ?? "",
    };
  }

  // Admin/Manager: alle Aufträge der Org
  const allAssignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["ASSIGNED", "COMPLETED"] },
      booking: { status: "confirmed" },
    },
    orderBy: { booking: { checkOut: "asc" } },
    include: {
      booking: { include: { apartment: true } },
      cleaner: { select: { name: true } },
    },
  });

  return {
    myAssignments: allAssignments,
    openAssignments: [] as typeof allAssignments,
    isCleaner: false as const,
    userName: session.user.name ?? "",
  };
}
