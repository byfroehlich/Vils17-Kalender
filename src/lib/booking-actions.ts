import { prisma } from "./prisma";
import { sendCleaningAssignmentMail } from "./mail";
import { sendCleaningWhatsApp } from "./whatsapp";
import { sendPushToUsers } from "./push";
import { effectiveRate } from "./rates";
import { logAudit } from "./audit";

// ─── Schreibende Aktionen an Buchungen ────────────────────────────────────────
// Eine Implementierung für die App-Routen UND die MCP-Schnittstelle — damit
// beide exakt dasselbe tun (Zuweisungsregeln, Benachrichtigungen, Audit).

export class ActionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Wer die Aktion auslöst — fürs Audit-Log */
export interface Actor {
  userId?: string;
  /** z.B. "mcp:Claude Desktop" */
  via?: string;
}

// ─── Reinigung zuweisen ───────────────────────────────────────────────────────

export async function assignCleaner(params: {
  organizationId: string;
  bookingId: string;
  /** null = niemand (bzw. Selbstreinigung mit isSelfClean) */
  cleanerId: string | null;
  isSelfClean?: boolean;
  /** undefined = Notiz unverändert lassen */
  notes?: string;
  actor: Actor;
}) {
  const { organizationId, bookingId, cleanerId, notes, actor } = params;
  const isSelfClean = params.isSelfClean ?? false;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId },
    include: { apartment: true },
  });
  if (!booking) throw new ActionError("Buchung nicht gefunden", 404);

  let cleaner = null;
  if (cleanerId) {
    cleaner = await prisma.user.findFirst({ where: { id: cleanerId, organizationId } });
    if (!cleaner) throw new ActionError("Reiniger nicht gefunden", 404);
  }

  // Aktuellen Status prüfen — COMPLETED bleibt erhalten beim Reiniger-Wechsel
  const existing = await prisma.cleaningAssignment.findUnique({
    where: { bookingId },
    select: { status: true, declinedById: true, cleanerId: true, rate: true },
  });
  const preserveCompleted = existing?.status === "COMPLETED";
  const newStatus = isSelfClean ? "SELF_CLEAN"
    : cleanerId ? (preserveCompleted ? "COMPLETED" : "ASSIGNED")
    : "UNASSIGNED";

  // Absage-Historie behalten: wer abgesagt hat, sieht die Buchung weiterhin als
  // "abgesagt · übernommen von X" — auch wenn ein Admin sie neu zuweist.
  // Gegenstandslos wird die Absage nur, wenn der Auftrag zurück an die absagende
  // Person geht oder die Reinigung auf Selbstreinigung umgestellt wird.
  // Satz: Bei erledigten Reinigungen festgeschrieben. Wechselt dabei die
  // Reinigungskraft, gilt deren Satz (Sondersatz nur, wenn er für sie vereinbart ist).
  const rate =
    newStatus !== "COMPLETED" || !cleaner ? null
    : existing?.cleanerId === cleaner.id && existing.rate != null ? existing.rate
    : effectiveRate({ rate: null, cleanerId: cleaner.id, cleaner, booking });

  const clearDecline =
    isSelfClean || !existing?.declinedById || existing.declinedById === cleanerId;

  const assignment = await prisma.cleaningAssignment.upsert({
    where: { bookingId },
    create: {
      organizationId,
      bookingId,
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
      rate,
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
  let notified = false;
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
    notified = true;
  }

  await logAudit({
    organizationId,
    userId: actor.userId,
    action: "assignment.created",
    entityType: "CleaningAssignment",
    entityId: assignment.id,
    details: { cleanerId, isSelfClean, bookingId, ...(actor.via ? { via: actor.via } : {}) },
  });

  return { assignment, booking, cleaner, notified, status: newStatus };
}

// ─── Notiz für die Reinigungskraft ────────────────────────────────────────────

export async function setAssignmentNotes(params: {
  organizationId: string;
  bookingId: string;
  notes: string;
  actor: Actor;
}) {
  const assignment = await prisma.cleaningAssignment.findFirst({
    where: { bookingId: params.bookingId, organizationId: params.organizationId },
  });
  if (!assignment) throw new ActionError("Nicht gefunden", 404);

  const notes = params.notes.trim() || null;
  await prisma.cleaningAssignment.update({ where: { id: assignment.id }, data: { notes } });

  if (params.actor.via) {
    await logAudit({
      organizationId: params.organizationId,
      userId: params.actor.userId,
      action: "assignment.notes.updated",
      entityType: "CleaningAssignment",
      entityId: assignment.id,
      details: { bookingId: params.bookingId, via: params.actor.via, leer: notes === null },
    });
  }
  return { previous: assignment.notes, notes };
}

// ─── Gästezahl korrigieren ────────────────────────────────────────────────────

/**
 * Setzt die Gästezahl von Hand (der Sync überschreibt sie dann nicht mehr) oder
 * hebt die Korrektur auf (null → der nächste Sync liefert wieder Smoobus Wert).
 * guestCountSource = "manual", damit auch der Portal-Mail-Import sie respektiert.
 */
export async function setGuestCount(params: {
  organizationId: string;
  bookingId: string;
  guestCount: number | null;
  actor: Actor;
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, organizationId: params.organizationId },
    select: { id: true, guestCount: true, guestCountManual: true },
  });
  if (!booking) throw new ActionError("Nicht gefunden", 404);

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data:
      params.guestCount === null
        ? { guestCountManual: false, guestCountSource: null }
        : { guestCount: params.guestCount, guestCountManual: true, guestCountSource: "manual" },
  });

  if (params.actor.via) {
    await logAudit({
      organizationId: params.organizationId,
      userId: params.actor.userId,
      action: "booking.guestCount.updated",
      entityType: "Booking",
      entityId: booking.id,
      details: { vorher: booking.guestCount, nachher: params.guestCount, via: params.actor.via },
    });
  }
  return { before: booking, booking: updated };
}
