import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendPushToRole } from "@/lib/push";

const schema = z.object({
  unavailable: z.boolean(),
  note: z.string().max(300).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  // CLEANER: nur eigene Aufträge — außer Hauptreiniger darf alle
  let cleanerFilter: Record<string, unknown> = {};
  if (session.user.role === "CLEANER") {
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

  if (!assignment) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const updated = await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: {
      cleanerUnavailable: parsed.data.unavailable,
      cleanerUnavailableNote: parsed.data.unavailable ? (parsed.data.note ?? null) : null,
      cleanerUnavailableAt: parsed.data.unavailable ? new Date() : null,
    },
  });

  if (parsed.data.unavailable) {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      select: { checkOut: true, apartment: { select: { name: true } } },
    });
    if (booking) {
      const checkOut = new Date(booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
      const apt = booking.apartment.name;
      const orgId = session.user.organizationId;
      const cleanerName = session.user.name;

      // Notify admins/managers
      sendPushToRole(orgId, ["ADMIN", "MANAGER"], {
        title: "Reinigung abgesagt",
        body: `${cleanerName} kann ${apt} am ${checkOut} nicht reinigen`,
        url: `/bookings/${params.id}`,
      }).catch(() => null);

      // Notify other cleaners that the job might become available
      sendPushToRole(orgId, ["CLEANER"], {
        title: "Reinigung wieder verfügbar",
        body: `${apt} am ${checkOut} — hat jemand Interesse?`,
        url: "/my-jobs/list",
      }, [session.user.id]).catch(() => null);
    }
  }

  return NextResponse.json({ success: true, assignment: updated });
}
