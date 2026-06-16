import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BillingView } from "@/components/billing/BillingView";

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!["ADMIN", "MANAGER"].includes(session.user.role)) redirect("/dashboard");

  const orgId = session.user.organizationId;

  // Alle erledigten Reinigungen mit Reiniger + Buchungsdaten
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
