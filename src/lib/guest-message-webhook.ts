import { prisma } from "./prisma";
import { fetchGuestMessages } from "./guest-messages";
import { recordSeen } from "./message-seen";
import { sendPushToRole } from "./push";
import { logAudit } from "./audit";

// Neue Gästenachricht sofort statt im Takt (Plan „Schnittstellen statt Browser“, Mathias 28.11.2026).
// Smoobu schickt bei jeder Nachricht den Webhook `newMessage`:
//   { "action": "newMessage", "user": …, "data": { "id": <Nachricht>, "sender": "guest", "booking": { "id": <Smoobu-Buchung> } } }
// Doku: https://docs.smoobu.com/ → Webhooks. Kein voller Buchungs-Sync nötig – Übersicht und MCP lesen die Chats ohnehin live.

export interface NewMessageEvent {
  organizationId: string;
  smoobuBookingId: number | null;
  messageId: string | null;
  sender: string | null;
}

export type NewMessageResult =
  | { handled: "host_reply" }
  | { handled: "unknown_booking" }
  | { handled: "duplicate" }
  | { handled: "notified"; bookingId: string };

/** Liest die Felder aus dem Webhook-Rumpf (nachgiebig, Smoobu-Formate schwanken). */
export function parseNewMessage(raw: unknown): { smoobuBookingId: number | null; messageId: string | null; sender: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.action !== "newMessage") return null;
  const d = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const booking = (d.booking && typeof d.booking === "object" ? d.booking : {}) as Record<string, unknown>;
  const bid = Number(booking.id ?? d.bookingId ?? d["booking-id"]);
  const mid = d.id ?? d.messageId;
  return {
    smoobuBookingId: Number.isFinite(bid) && bid > 0 ? bid : null,
    messageId: mid == null ? null : String(mid),
    sender: typeof d.sender === "string" ? d.sender.toLowerCase() : null,
  };
}

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("de-AT", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replaceAll(",", "");

export async function handleNewMessage(ev: NewMessageEvent): Promise<NewMessageResult> {
  // Unsere eigene Antwort (oder eine Automatik): Chat-Stand neu, keine Meldung
  if (ev.sender && ev.sender !== "guest") {
    return { handled: "host_reply" };
  }

  const booking = ev.smoobuBookingId
    ? await prisma.booking.findFirst({
        where: { organizationId: ev.organizationId, smoobuId: ev.smoobuBookingId },
        select: { id: true, smoobuId: true, checkIn: true, apartment: { select: { name: true } } },
      })
    : null;
  if (!booking) {
    // Anfrage ohne Buchung oder Buchung noch nicht synchronisiert – der nächste Sync holt sie
    return { handled: "unknown_booking" };
  }

  // Smoobu kann denselben Webhook mehrfach schicken → je Nachricht nur eine Meldung
  if (ev.messageId) {
    const seen = await prisma.guestMessageSeen.findFirst({
      where: { organizationId: ev.organizationId, bookingId: booking.id, messageId: ev.messageId },
      select: { id: true },
    });
    if (seen) return { handled: "duplicate" };
  }

  // Eingangszeit merken (≈ Webhook-Zeit) – Übersicht, Gäste-Seite und MCP zeigen dann „eingegangen spätestens …“ minutengenau
  try {
    const { messages } = await fetchGuestMessages(booking.smoobuId as number, 1);
    await recordSeen(ev.organizationId, booking.id, messages);
  } catch {
    // Smoobu kurz nicht erreichbar: Meldung trotzdem schicken, der App-Takt holt den Rest
  }
  if (ev.messageId) {
    await prisma.guestMessageSeen.createMany({
      data: [{ organizationId: ev.organizationId, bookingId: booking.id, messageId: ev.messageId }],
      skipDuplicates: true,
    });
  }

  // Ohne Gastnamen und ohne Text – nur Wohnung und Anreisetag
  await sendPushToRole(ev.organizationId, ["ADMIN", "MANAGER"], {
    title: "💬 Neue Gästenachricht",
    body: `${booking.apartment.name} · Anreise ${dayLabel(booking.checkIn)}`,
    url: "/messages",
  }).catch(() => null);

  await logAudit({
    organizationId: ev.organizationId,
    action: "guest.message.received",
    entityType: "Booking",
    entityId: booking.id,
    details: { via: "webhook" },
  });
  return { handled: "notified", bookingId: booking.id };
}
