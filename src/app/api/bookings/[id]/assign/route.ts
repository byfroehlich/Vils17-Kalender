import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendCleaningAssignmentMail } from "@/lib/mail";
import { sendCleaningWhatsApp } from "@/lib/whatsapp";
import { sendPushToUsers } from "@/lib/push";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const assignSchema = z.object({
  cleanerId: z.string().nullable(), // null = Selbstreinigung
  isSelfClean: z.boolean().default(false),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const { cleanerId, isSelfClean, notes } = parsed.data;

  // Buchung laden und prüfen
  const booking = await prisma.booking.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    include: { apartment: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });
  }

  // Cleaner laden (wenn angegeben)
  let cleaner = null;
  if (cleanerId) {
    cleaner = await prisma.user.findFirst({
      where: { id: cleanerId, organizationId: session.user.organizationId },
    });
    if (!cleaner) {
      return NextResponse.json({ error: "Reiniger nicht gefunden" }, { status: 404 });
    }
  }

  // Aktuellen Status prüfen — COMPLETED bleibt erhalten beim Reiniger-Wechsel
  const existing = await prisma.cleaningAssignment.findUnique({
    where: { bookingId: params.id },
    select: { status: true, declinedById: true },
  });
  const preserveCompleted = existing?.status === "COMPLETED";
  const newStatus = isSelfClean ? "SELF_CLEAN"
    : cleanerId ? (preserveCompleted ? "COMPLETED" : "ASSIGNED")
    : "UNASSIGNED";

  // Absage-Historie behalten: wer abgesagt hat, sieht die Buchung weiterhin als
  // "abgesagt · übernommen von X" — auch wenn ein Admin sie neu zuweist.
  // Gegenstandslos wird die Absage nur, wenn der Auftrag zurück an die absagende
  // Person geht oder die Reinigung auf Selbstreinigung umgestellt wird.
  const clearDecline =
    isSelfClean || !existing?.declinedById || existing.declinedById === cleanerId;

  // Assignment anlegen oder aktualisieren
  const assignment = await prisma.cleaningAssignment.upsert({
    where: { bookingId: params.id },
    create: {
      organizationId: session.user.organizationId,
      bookingId: params.id,
      cleanerId: cleanerId ?? null,
      isSelfClean,
      status: isSelfClean ? "SELF_CLEAN" : cleanerId ? "ASSIGNED" : "UNASSIGNED",
      notes,
      assignedAt: new Date(),
    },
    update: {
      cleanerId: cleanerId ?? null,
      isSelfClean,
      status: newStatus,
      notes,
      assignedAt: new Date(),
      notifiedAt: null,
      cleanerUnavailable: false,
      cleanerUnavailableNote: null,
      cleanerUnavailableAt: null,
      ...(clearDecline ? { declinedById: null } : {}),
      cleanerReminderSentAt: null,
      adminReminderSentAt: null,
    },
  });

  // Benachrichtigung senden (nur wenn echter Reiniger zugewiesen)
  if (cleaner && !isSelfClean) {
    const notifyPromises: Promise<unknown>[] = [];

    // Push an den zugewiesenen Reiniger (nicht bei bereits erledigten Reinigungen)
    if (!preserveCompleted) {
      const checkInStr = new Date(booking.checkIn).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
      notifyPromises.push(
        sendPushToUsers([cleaner.id], {
          title: "Neuer Reinigungsauftrag",
          body: `${booking.apartment.name} am ${checkInStr} wurde dir zugewiesen`,
          url: "/my-jobs",
        }).catch((err) => console.error("[Push] Failed:", err))
      );
    }

    if (cleaner.email) {
      notifyPromises.push(
        sendCleaningAssignmentMail({
          to: cleaner.email,
          cleanerName: cleaner.name,
          apartmentName: booking.apartment.name,
          checkOut: booking.checkOut,
          checkIn: booking.checkIn,
          guestCount: booking.guestCount,
          notes,
          language: cleaner.language,
        }).catch((err) => console.error("[Mail] Failed:", err))
      );
    }

    if (cleaner.phone) {
      notifyPromises.push(
        sendCleaningWhatsApp({
          to: cleaner.phone,
          cleanerName: cleaner.name,
          apartmentName: booking.apartment.name,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          language: cleaner.language,
        }).catch((err) => console.error("[WhatsApp] Failed:", err))
      );
    }

    await Promise.all(notifyPromises);

    await prisma.cleaningAssignment.update({
      where: { id: assignment.id },
      data: { notifiedAt: new Date() },
    });
  }

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "assignment.created",
    entityType: "CleaningAssignment",
    entityId: assignment.id,
    details: { cleanerId, isSelfClean, bookingId: params.id },
  });

  return NextResponse.json({ success: true, assignment });
}
