import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BillingView } from "@/components/billing/BillingView";
import { CleanerBillingView } from "@/components/billing/CleanerBillingView";
import { effectiveRate, isPremiumFor } from "@/lib/rates";

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const orgId = session.user.organizationId;

  // Reiniger: nur eigene erledigte Aufträge
  if (session.user.role === "CLEANER") {
    const raw = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: orgId,
        cleanerId: session.user.id,
        status: "COMPLETED",
      },
      include: {
        booking: {
          select: {
            checkOut: true,
            premiumRate: true,
            premiumRateCleanerId: true,
            apartment: { select: { name: true, color: true } },
          },
        },
        cleaner: { select: { cleanerRate: true } },
      },
      orderBy: { booking: { checkOut: "desc" } },
    });
    // Satz pro Auftrag — festgeschrieben oder nach den Regeln in lib/rates.ts
    const assignments = raw.map((a) => ({
      ...a,
      rate: effectiveRate(a),
      isPremium: isPremiumFor(a.booking, a.cleanerId),
    }));
    return <CleanerBillingView assignments={assignments} cleanerName={session.user.name ?? ""} />;
  }

  if (!["ADMIN", "MANAGER"].includes(session.user.role)) redirect("/dashboard");

  // Admin/Manager: alle erledigten Reinigungen
  const raw = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: orgId,
      status: "COMPLETED",
      cleanerId: { not: null },
    },
    include: {
      booking: {
        select: {
          checkOut: true,
          guestName: true,
          premiumRate: true,
          premiumRateCleanerId: true,
          apartment: { select: { name: true } },
        },
      },
      cleaner: { select: { id: true, name: true, cleanerRate: true } },
    },
    orderBy: { booking: { checkOut: "desc" } },
  });
  const assignments = raw.map((a) => ({
    ...a,
    rate: effectiveRate(a),
    isPremium: isPremiumFor(a.booking, a.cleanerId),
  }));

  return <BillingView assignments={assignments} />;
}
