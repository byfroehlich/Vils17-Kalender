import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MyJobsList } from "@/components/my-jobs/MyJobsList";

export default async function MyJobsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isCleaner = session.user.role === "CLEANER";

  const assignments = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(isCleaner ? { cleanerId: session.user.id } : {}),
      status: { in: ["ASSIGNED", "COMPLETED"] },
      booking: { status: "confirmed" },
    },
    orderBy: { booking: { checkOut: "asc" } },
    include: {
      booking: {
        include: { apartment: true },
      },
      cleaner: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
          {isCleaner ? "Meine Aufträge" : "Alle Aufträge"}
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>
          {isCleaner ? "Deine zugewiesenen Reinigungsaufträge" : "Übersicht aller Reinigungsaufträge"}
        </p>
      </div>
      <MyJobsList assignments={assignments} isCleaner={isCleaner} />
    </div>
  );
}
