import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CLEANER") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Race-condition-safe: updateMany mit status=UNASSIGNED als Filter
  // Erster Cleaner der zusagt gewinnt — zweiter bekommt count=0
  const updated = await prisma.cleaningAssignment.updateMany({
    where: {
      bookingId: params.id,
      organizationId: session.user.organizationId,
      status: "UNASSIGNED",
      cleanerId: null,
    },
    data: {
      cleanerId: session.user.id,
      status: "ASSIGNED",
      assignedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Auftrag wurde bereits von jemand anderem übernommen" }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
