import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function getMyJobsData() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isCleaner = session.user.role === "CLEANER";

  let isPrimary = false;
  if (isCleaner) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPrimary: true },
    });
    isPrimary = user?.isPrimary ?? false;
  }

  const assignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: session.user.organizationId,
      // Hauptreiniger und Admin/Manager sehen alle; normaler Cleaner nur eigene
      ...(isCleaner && !isPrimary ? { cleanerId: session.user.id } : {}),
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
    assignments,
    isCleaner,
    isPrimary,
    userName: session.user.name ?? "",
  };
}
