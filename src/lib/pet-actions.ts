import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { ActionError, type Actor } from "./booking-actions";
import { detectDogs, petFee, petFeeMessage, portalCollectsPetFee, type DogDetection } from "./pets";
import { fetchGuestMessages, sendGuestMessage } from "./guest-messages";

// ─── Hunde und Hundegebühr — gemeinsam für App-Routen UND MCP ─────────────────
// Personenbezogene Texte (Auszug, Nachricht) landen nie im Audit-Log.

const BOOKING_SELECT = {
  id: true, smoobuId: true, guestName: true, channelName: true, channelNotice: true, status: true,
  checkIn: true, checkOut: true, petCount: true, petSource: true, petHint: true,
  petFeeStatus: true, petFeeAmount: true, petFeeRequestedAt: true, petFeePaidAt: true,
  apartment: { select: { name: true } },
} as const;

async function load(organizationId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, organizationId }, select: BOOKING_SELECT });
  if (!b) throw new ActionError("Buchung nicht gefunden", 404);
  return b;
}

/** Hundezahl setzen. Von Hand gesetzte Werte überschreibt nur eine neue Hand-Eingabe. */
export async function setPets(params: {
  organizationId: string;
  bookingId: string;
  count: number | null;
  source: "manual" | "notice" | "chat";
  hint?: string | null;
  actor: Actor;
}) {
  const b = await load(params.organizationId, params.bookingId);
  if (params.source !== "manual" && b.petSource === "manual") return { changed: false, booking: b };
  if (b.petCount === params.count && b.petSource === params.source) return { changed: false, booking: b };

  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: {
      petCount: params.count,
      petSource: params.count === null && params.source === "manual" ? null : params.source,
      petHint: params.source === "manual" ? b.petHint : (params.hint ?? null),
    },
    select: BOOKING_SELECT,
  });
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "booking.pets.updated",
    entityType: "Booking",
    entityId: b.id,
    details: { vorher: b.petCount, nachher: params.count, quelle: params.source, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return { changed: true, booking: updated };
}

export type PetFeeStatusValue = "REQUESTED" | "PAID" | "WAIVED" | null;

export async function setPetFeeStatus(params: {
  organizationId: string;
  bookingId: string;
  status: PetFeeStatusValue;
  amount?: number;
  actor: Actor;
}) {
  const b = await load(params.organizationId, params.bookingId);
  if (!b.petCount) throw new ActionError("Für diese Buchung ist kein Hund eingetragen");
  if (portalCollectsPetFee(b.channelName)) throw new ActionError(`${b.channelName} kassiert die Hundegebühr selbst`);
  const fee = petFee(b);
  const now = new Date();
  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: {
      petFeeStatus: params.status,
      petFeeAmount: params.status === null ? null : params.status === "WAIVED" ? 0 : (params.amount ?? b.petFeeAmount ?? fee.amount),
      ...(params.status === "REQUESTED" ? { petFeeRequestedAt: now } : {}),
      ...(params.status === "PAID" ? { petFeePaidAt: now } : {}),
      ...(params.status === null ? { petFeeRequestedAt: null, petFeePaidAt: null } : {}),
    },
    select: BOOKING_SELECT,
  });
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "booking.petfee.updated",
    entityType: "Booking",
    entityId: b.id,
    details: { vorher: b.petFeeStatus, nachher: params.status, betrag: updated.petFeeAmount, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return updated;
}

/** Vorschlagstext für die Anforderung (Zahlungsweg aus PET_FEE_PAYMENT_TEXT). */
export async function petFeeDraft(organizationId: string, bookingId: string) {
  const b = await load(organizationId, bookingId);
  const fee = petFee(b);
  if (fee.state === "KEINE") throw new ActionError("Für diese Buchung ist kein Hund eingetragen");
  if (fee.state === "PORTAL") throw new ActionError(`${b.channelName} kassiert die Hundegebühr selbst`);
  return {
    booking: b,
    fee,
    text: petFeeMessage({ guestName: b.guestName, dogs: fee.dogs, nights: fee.nights, amount: fee.amount, paymentText: process.env.PET_FEE_PAYMENT_TEXT ?? null }),
    paymentConfigured: !!process.env.PET_FEE_PAYMENT_TEXT?.trim(),
  };
}

/** Schickt die Anforderung an den Gast und setzt den Status auf angefordert. Nur nach Freigabe aufrufen. */
export async function requestPetFee(params: { organizationId: string; bookingId: string; text: string; actor: Actor }) {
  const b = await load(params.organizationId, params.bookingId);
  if (!b.smoobuId) throw new ActionError("Buchung stammt nicht aus Smoobu — kein Chat");
  if (b.status !== "confirmed") throw new ActionError("Buchung ist storniert");
  if (params.text.includes("[ZAHLUNGSWEG EINTRAGEN]")) throw new ActionError("Im Text fehlt noch der Zahlungsweg");
  const fee = petFee(b);
  await sendGuestMessage(b.smoobuId, params.text);
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "guest.message.sent",
    entityType: "Booking",
    entityId: b.id,
    details: { zweck: "hundegebuehr", zeichen: params.text.length, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return setPetFeeStatus({ organizationId: params.organizationId, bookingId: b.id, status: "REQUESTED", amount: fee.amount, actor: params.actor });
}

export interface DogScanResult {
  bookingId: string;
  detection: DogDetection | null;
  source: "notice" | "chat" | null;
  /** true, wenn petCount dadurch gesetzt/geändert wurde */
  changed: boolean;
  /** würde bei dryRun eingetragen */
  wouldChange: boolean;
  skippedManual: boolean;
}

/**
 * Prüft Portalnotiz und Gästenachrichten einer Buchung auf Hunde und trägt das
 * Ergebnis ein (nie über eine Hand-Eingabe). Nur Nachrichten vom Gast zählen.
 */
export async function scanBookingForDogs(params: { organizationId: string; bookingId: string; actor: Actor; withChat?: boolean; dryRun?: boolean }): Promise<DogScanResult> {
  const b = await load(params.organizationId, params.bookingId);
  let detection = detectDogs(b.channelNotice);
  let source: DogScanResult["source"] = detection ? "notice" : null;

  if (params.withChat !== false && b.smoobuId) {
    const { messages } = await fetchGuestMessages(b.smoobuId, 3);
    for (const m of messages.filter((x) => x.von === "gast")) {
      const d = detectDogs(m.text);
      if (d && (!detection || d.count > detection.count)) {
        detection = d;
        source = "chat";
      }
    }
  }

  const none = { changed: false, wouldChange: false };
  if (b.petSource === "manual") return { bookingId: b.id, detection, source, ...none, skippedManual: true };
  if (!detection || !source) return { bookingId: b.id, detection: null, source: null, ...none, skippedManual: false };
  if ((b.petCount ?? 0) >= detection.count) return { bookingId: b.id, detection, source, ...none, skippedManual: false };
  if (params.dryRun) return { bookingId: b.id, detection, source, changed: false, wouldChange: true, skippedManual: false };

  const r = await setPets({ organizationId: params.organizationId, bookingId: b.id, count: detection.count, source, hint: detection.hint.slice(0, 200), actor: params.actor });
  return { bookingId: b.id, detection, source, changed: r.changed, wouldChange: r.changed, skippedManual: false };
}
