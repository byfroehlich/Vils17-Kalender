import { prisma } from "./prisma";
import { sendCleaningAssignmentMail } from "./mail";
import { sendCleaningWhatsApp } from "./whatsapp";
import { sendPushToUsers, sendPushToRole } from "./push";
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

// ─── Reinigungsstatus setzen ──────────────────────────────────────────────────

export type CleaningStatusValue = "UNASSIGNED" | "SELF_CLEAN" | "ASSIGNED" | "COMPLETED";

/**
 * Setzt den Status eines Reinigungsauftrags — gleiche Regeln wie „Als erledigt
 * markieren“ in der App: Beim Erledigen wird der Satz festgeschrieben, beim
 * Zurücksetzen auf offen/Selbstreinigung wird die Zuweisung aufgehoben.
 * onlyCleanerId: Reinigungskräfte dürfen nur eigene Aufträge ändern.
 */
export async function setCleaningStatus(params: {
  organizationId: string;
  bookingId: string;
  status: CleaningStatusValue;
  actor: Actor;
  /** Name für die Push-Nachricht („Kerstin: … ist fertig“) */
  actorName: string;
  onlyCleanerId?: string;
}) {
  const assignment = await prisma.cleaningAssignment.findFirst({
    where: {
      bookingId: params.bookingId,
      organizationId: params.organizationId,
      ...(params.onlyCleanerId ? { cleanerId: params.onlyCleanerId } : {}),
    },
    include: {
      cleaner: { select: { cleanerRate: true } },
      booking: { select: { premiumRate: true, premiumRateCleanerId: true } },
    },
  });
  if (!assignment) throw new ActionError("Nicht gefunden", 404);

  const newStatus = params.status;

  const updated = await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: {
      status: newStatus,
      // Satz beim Erledigen festschreiben — spätere Satzänderungen verändern
      // diese Abrechnung dann nicht mehr. Wird "erledigt" zurückgenommen, gilt
      // wieder der laufende Satz.
      rate: newStatus === "COMPLETED" && assignment.cleanerId
        // schon erledigt → festgeschriebenen Satz behalten, nicht neu rechnen
        ? effectiveRate({ ...assignment, rate: assignment.status === "COMPLETED" ? assignment.rate : null })
        : null,
      // Zuweisung aufheben wenn auf offen/selbstreinigung zurückgesetzt
      ...(newStatus === "UNASSIGNED" || newStatus === "SELF_CLEAN"
        ? { cleanerId: null, assignedAt: null, cleanerUnavailable: false, cleanerUnavailableNote: null, declinedById: null }
        : {}),
    },
  });

  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: { checkIn: true, apartment: { select: { name: true } } },
  });

  if (booking) {
    // Reinigungstag = Anreisetag der nächsten Gäste (UTC-Mitternacht gespeichert)
    const cleaningDay = new Date(booking.checkIn).toLocaleDateString("de-AT", { day: "numeric", month: "numeric", timeZone: "UTC" });
    const apt = booking.apartment.name;

    if (newStatus === "COMPLETED") {
      sendPushToRole(params.organizationId, ["ADMIN", "MANAGER"], {
        title: "Reinigung erledigt",
        body: `${params.actorName}: ${apt} am ${cleaningDay} ist fertig`,
        url: `/bookings/${params.bookingId}`,
      }).catch(() => null);
    } else if (newStatus === "UNASSIGNED") {
      sendPushToRole(params.organizationId, ["CLEANER"], {
        title: "Reinigung wieder verfügbar",
        body: `${apt} am ${cleaningDay} ist wieder frei — jetzt zusagen!`,
        url: "/my-jobs/list",
      }).catch(() => null);
    }
  }

  if (params.actor.via) {
    await logAudit({
      organizationId: params.organizationId,
      userId: params.actor.userId,
      action: "assignment.status.updated",
      entityType: "CleaningAssignment",
      entityId: assignment.id,
      details: { bookingId: params.bookingId, vorher: assignment.status, nachher: newStatus, via: params.actor.via },
    });
  }
  return { previous: assignment.status, assignment: updated };
}

// ─── Wäschestatus setzen ──────────────────────────────────────────────────────

export type LaundryStatusValue = "OPEN" | "ORDERED" | "AVAILABLE";

/**
 * Setzt den Wäschestatus (offen / bestellt / vorhanden) und optional die Notiz.
 * Legt den Reinigungsauftrag an, falls er fehlt — wie die App. Bei „bestellt“
 * werden Zeitpunkt und Mengen festgehalten, damit später nachvollziehbar ist,
 * was wann bestellt wurde. Eine Bestellung beim Lieferanten löst das NICHT aus.
 */
export async function setLaundryStatus(params: {
  organizationId: string;
  bookingId: string;
  status: LaundryStatusValue;
  notes?: string | null;
  quantity?: object | null;
  actor: Actor;
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, organizationId: params.organizationId },
    select: { id: true },
  });
  if (!booking) throw new ActionError("Buchung nicht gefunden", 404);

  const assignment =
    (await prisma.cleaningAssignment.findUnique({ where: { bookingId: booking.id } })) ??
    (await prisma.cleaningAssignment.create({ data: { organizationId: params.organizationId, bookingId: booking.id } }));

  const updated = await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: {
      laundryStatus: params.status,
      ...(params.notes !== undefined ? { laundryNotes: params.notes?.trim() || null } : {}),
      ...(params.status === "ORDERED"
        ? { laundryOrderedAt: new Date(), ...(params.quantity ? { laundryQuantity: params.quantity } : {}) }
        : {}),
      ...(params.status === "OPEN" ? { laundryOrderedAt: null } : {}),
    },
  });

  if (params.actor.via) {
    await logAudit({
      organizationId: params.organizationId,
      userId: params.actor.userId,
      action: "laundry.status.updated",
      entityType: "CleaningAssignment",
      entityId: assignment.id,
      details: { bookingId: booking.id, vorher: assignment.laundryStatus, nachher: params.status, via: params.actor.via },
    });
  }
  return { previous: assignment.laundryStatus, assignment: updated };
}
