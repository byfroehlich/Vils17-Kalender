import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MyJobsList } from "@/components/my-jobs/MyJobsList";

export default async function MyJobsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const assignments = await prisma.cleaningAssignment.findMany({
    where: {
      cleanerId: session.user.id,
      status: { in: ["ASSIGNED", "COMPLETED"] },
      booking: { status: "confirmed" },
    },
    orderBy: { booking: { checkOut: "asc" } },
    include: {
      booking: { include: { apartment: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Meine Aufträge</h1>
        <p className="text-gray-500 mt-1">Ihre zugewiesenen Reinigungsaufträge</p>
      </div>
      <MyJobsList assignments={assignments} />
    </div>
  );
}
