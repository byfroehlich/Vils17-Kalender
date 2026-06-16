import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendPushToRole } from "@/lib/push";

const schema = z.object({
  status: z.enum(["UNASSIGNED", "SELF_CLEAN", "ASSIGNED", "COMPLETED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "MANAGER";
  const isCleaner = session.user.role === "CLEANER";

  if (!isAdmin && !isCleaner) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  // CLEANER darf nur COMPLETED setzen (nicht zurücksetzen)
  if (isCleaner && parsed.data.status !== "COMPLETED") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // CLEANER: nur eigene Aufträge oder als Hauptreiniger alle
  let cleanerFilter: Record<string, unknown> = {};
  if (isCleaner) {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPrimary: true },
    });
    if (!currentUser?.isPrimary) {
      cleanerFilter = { cleanerId: session.user.id };
    }
  }

  const assignment = await prisma.cleaningAssignment.findFirst({
    where: {
      bookingId: params.id,
      organizationId: session.user.organizationId,
      ...cleanerFilter,
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const updated = await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: { status: parsed.data.status },
  });

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { checkOut: true, apartment: { select: { name: true } } },
  });
  const orgId = session.user.organizationId;

  if (booking) {
    const checkOut = new Date(booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
    const apt = booking.apartment.name;

    if (parsed.data.status === "COMPLETED") {
      // Reinigung erledigt → Push an Admin/Manager
      sendPushToRole(orgId, ["ADMIN", "MANAGER"], {
        title: "Reinigung erledigt",
        body: `${session.user.name}: ${apt} am ${checkOut} ist fertig`,
        url: `/bookings/${params.id}`,
      }).catch(() => null);
    } else if (parsed.data.status === "UNASSIGNED") {
      // Auftrag wieder offen → Push an alle CLEANERs
      sendPushToRole(orgId, ["CLEANER"], {
        title: "Reinigung wieder verfügbar",
        body: `${apt} am ${checkOut} ist wieder frei — jetzt zusagen!`,
        url: "/my-jobs/list",
      }).catch(() => null);
    }
  }

  return NextResponse.json({ success: true, assignment: updated });
}
