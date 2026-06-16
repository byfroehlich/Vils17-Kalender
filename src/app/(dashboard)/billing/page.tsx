import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BillingView } from "@/components/billing/BillingView";
import { CleanerBillingView } from "@/components/billing/CleanerBillingView";

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const orgId = session.user.organizationId;

  // Reiniger: nur eigene erledigte Aufträge
  if (session.user.role === "CLEANER") {
    const assignments = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        cleanerId: session.user.id,
        status: "COMPLETED",
      },
      include: {
        booking: { select: { checkOut: true, apartment: { select: { name: true, color: true } } } },
        cleaner: { select: { cleanerRate: true } },
      },
      orderBy: { booking: { checkOut: "desc" } },
    });
    return <CleanerBillingView assignments={assignments} cleanerName={session.user.name ?? ""} />;
  }

  if (!["ADMIN", "MANAGER"].includes(session.user.role)) redirect("/dashboard");

  // Admin/Manager: alle erledigten Reinigungen
  const assignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: orgId,
      status: "COMPLETED",
      cleanerId: { not: null },
    },
    include: {
      booking: { select: { checkOut: true, guestName: true } },
      cleaner: { select: { id: true, name: true, cleanerRate: true } },
    },
    orderBy: { booking: { checkOut: "desc" } },
  });

  return <BillingView assignments={assignments} />;
}
