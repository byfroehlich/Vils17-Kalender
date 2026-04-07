import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CleanerList } from "@/components/cleaners/CleanerList";

export default async function CleanersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CLEANER") redirect("/my-jobs");

  const cleaners = await prisma.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      role: "CLEANER",
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assignments: true } },
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Reinigung</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Reinigungskräfte und Firmen verwalten.
          </p>
        </div>
      </div>
      <CleanerList cleaners={cleaners} />
    </div>
  );
}
