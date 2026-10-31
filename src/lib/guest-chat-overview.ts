import { prisma } from "./prisma";
import { fetchGuestMessages, lastMessage } from "./guest-messages";
import { addDays, todayVienna } from "./mcp/format";
import { logAudit } from "./audit";

// Chats, bei denen die letzte Nachricht vom Gast kommt — gemeinsam für die
// Seite „Gästechat“ und das MCP-Tool offene_gaestenachrichten.
// Antworten, die direkt in der Airbnb- oder Booking-App geschrieben wurden,
// kommen nicht zu Smoobu zurück — solche Chats erscheinen hier trotzdem als offen.

export const MAX_CHATS = 25;

export async function findUnansweredChats(params: { organizationId: string; days?: number; apartmentId?: string | null }) {
  const today = todayVienna();
  const rows = await prisma.booking.findMany({
    where: {
      organizationId: params.organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      ...(params.apartmentId ? { apartmentId: params.apartmentId } : {}),
      checkOut: { gte: today },
      checkIn: { lt: addDays(today, (params.days ?? 30) + 1) },
    },
    orderBy: { checkIn: "asc" },
    take: MAX_CHATS + 1,
    select: {
      id: true, smoobuId: true, guestName: true, checkIn: true, checkOut: true, channelName: true, status: true,
      chatDoneMessageId: true,
      apartment: { select: { name: true } },
    },
  });

  const open: { booking: (typeof rows)[number]; last: { id: string; text: string; betreff: string | null } }[] = [];
  const errors: { booking: (typeof rows)[number]; error: string }[] = [];
  for (const b of rows.slice(0, MAX_CHATS)) {
    try {
      const { messages } = await fetchGuestMessages(b.smoobuId as number, 3);
      const last = lastMessage(messages);
      // „Erledigt – keine Antwort nötig“ gilt nur bis zur markierten Nachricht; schreibt der Gast erneut, ist der Chat wieder offen.
      if (last?.von === "gast" && last.id !== b.chatDoneMessageId) open.push({ booking: b, last: { id: last.id, text: last.text, betreff: last.betreff } });
    } catch (err) {
      errors.push({ booking: b, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { checked: Math.min(rows.length, MAX_CHATS), truncated: rows.length > MAX_CHATS, open, errors };
}

export class ChatDoneError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/**
 * Entscheidung Mathias 31.10.2026: Ein Gästechat, der keine Antwort braucht (nur eine Info des Gastes),
 * kann als erledigt markiert werden. Gilt bis zur angegebenen letzten Nachricht — kommt danach eine
 * neue Gastnachricht, steht der Chat wieder unter „Wartet auf Antwort“.
 */
export async function markChatDone(params: { organizationId: string; bookingId: string; messageId: string; actor: { userId?: string; via?: string } }) {
  const b = await prisma.booking.findFirst({ where: { id: params.bookingId, organizationId: params.organizationId }, select: { id: true } });
  if (!b) throw new ChatDoneError("Buchung nicht gefunden", 404);
  await prisma.booking.update({ where: { id: b.id }, data: { chatDoneMessageId: params.messageId } });
  await logAudit({
    organizationId: params.organizationId, userId: params.actor.userId, action: "guest.chat.done",
    entityType: "Booking", entityId: b.id, details: { ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return { bookingId: b.id, messageId: params.messageId };
}
