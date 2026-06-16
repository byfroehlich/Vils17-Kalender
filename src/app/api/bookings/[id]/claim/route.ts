import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToRole } from "@/lib/push";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CLEANER") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Race-condition-safe: updateMany mit status=UNASSIGNED als Filter
  // Erster Cleaner der zusagt gewinnt — zweiter bekommt count=0
  // cleanerId kann noch auf den abgesagten Reiniger zeigen (cleanerUnavailable=true)
  // → daher nicht `cleanerId: null` als Bedingung, nur status=UNASSIGNED
  const updated = await prisma.cleaningAssignment.updateMany({
    where: {
      bookingId: params.id,
      organizationId: session.user.organizationId,
      status: "UNASSIGNED",
    },
    data: {
      cleanerId: session.user.id,
      status: "ASSIGNED",
      assignedAt: new Date(),
      cleanerUnavailable: false,
      cleanerUnavailableNote: null,
      cleanerUnavailableAt: null,
      cleanerReminderSentAt: null,
      adminReminderSentAt: null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Auftrag wurde bereits von jemand anderem übernommen" }, { status: 409 });
  }

  // Push an Admin/Manager: Auftrag zugesagt
  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { checkOut: true, apartment: { select: { name: true } } },
  });
  if (booking) {
    const checkOut = new Date(booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
    sendPushToRole(session.user.organizationId, ["ADMIN", "MANAGER"], {
      title: "Reinigung zugesagt",
      body: `${session.user.name} übernimmt die Reinigung am ${checkOut} (${booking.apartment.name})`,
      url: `/bookings/${params.id}`,
    }).catch(() => null);
  }

  return NextResponse.json({ success: true });
}
