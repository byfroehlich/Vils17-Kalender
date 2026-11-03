import { prisma } from "./prisma";
import { fetchGuestMessages, lastMessage } from "./guest-messages";
import { addDays, todayVienna } from "./mcp/format";
import { logAudit } from "./audit";
import { recordSeen, type MessageTime } from "./message-seen";

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

  const open: { booking: (typeof rows)[number]; last: { id: string; text: string; betreff: string | null; time: MessageTime | null } }[] = [];
  const errors: { booking: (typeof rows)[number]; error: string }[] = [];
  for (const b of rows.slice(0, MAX_CHATS)) {
    try {
      const { messages } = await fetchGuestMessages(b.smoobuId as number, 3);
      const last = lastMessage(messages);
      const times = await recordSeen(params.organizationId, b.id, messages).catch(() => null);
      // „Erledigt – keine Antwort nötig“ gilt nur bis zur markierten Nachricht; schreibt der Gast erneut, ist der Chat wieder offen.
      if (last?.von === "gast" && last.id !== b.chatDoneMessageId) open.push({ booking: b, last: { id: last.id, text: last.text, betreff: last.betreff, time: times?.get(last.id) ?? null } });
    } catch (err) {
      errors.push({ booking: b, error: err instanceof Error ? err.message : String(err) });
    }
  }
  // Gemeinsamer Stand für Übersicht, Gäste-Seite und MCP: nur der Standardumfang (alle Wohnungen, 30 Tage, ohne Fehler)
  if (!params.apartmentId && (params.days ?? 30) === 30 && !errors.length) {
    await saveOpenChats(params.organizationId, open.map((o) => ({
      bookingId: o.booking.id, guestName: o.booking.guestName, apartmentName: o.booking.apartment.name,
      checkIn: o.booking.checkIn.toISOString(), messageId: o.last.id,
    }))).catch(() => null);
  }
  return { checked: Math.min(rows.length, MAX_CHATS), truncated: rows.length > MAX_CHATS, open, errors };
}

// ─── Gemeinsamer Stand (Organization.openChats) ───────────────────────────────
// Entscheidung Mathias 04.11.2026: Zentrale und Vils17-Übersicht zeigten unterschiedliche Stände, weil die
// Übersicht Smoobu nur mit Zeitbudget fragt. Jetzt lesen alle aus demselben, regelmäßig erneuerten Stand.

export interface OpenChatEntry { bookingId: string; guestName: string; apartmentName: string; checkIn: string; messageId: string }

/** Stand gilt als frisch bis … */
export const OPEN_CHATS_FRESH_MS = 20 * 60_000;
/** App-Takt erneuert den Stand, wenn er älter ist als … */
export const OPEN_CHATS_REFRESH_MS = 10 * 60_000;

async function saveOpenChats(organizationId: string, items: OpenChatEntry[]) {
  await prisma.organization.update({ where: { id: organizationId }, data: { openChats: items as unknown as object, openChatsAt: new Date() } });
}

export async function readOpenChats(organizationId: string): Promise<{ at: Date; items: OpenChatEntry[] } | null> {
  const o = await prisma.organization.findUnique({ where: { id: organizationId }, select: { openChats: true, openChatsAt: true } });
  if (!o?.openChatsAt || !Array.isArray(o.openChats)) return null;
  return { at: o.openChatsAt, items: o.openChats as unknown as OpenChatEntry[] };
}

/** Im App-Takt: Stand erneuern, wenn älter als OPEN_CHATS_REFRESH_MS (sonst nichts tun) */
export async function refreshOpenChats(organizationId: string, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const cur = await readOpenChats(organizationId);
  if (!opts.force && cur && now.getTime() - cur.at.getTime() < OPEN_CHATS_REFRESH_MS) return { refreshed: false };
  await findUnansweredChats({ organizationId, days: 30 });
  return { refreshed: true };
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
  // Sofort auch aus dem gemeinsamen Stand nehmen, damit Übersicht und Zentrale nicht bis zur nächsten Prüfung nachhängen
  const cur = await readOpenChats(params.organizationId).catch(() => null);
  if (cur) await prisma.organization.update({
    where: { id: params.organizationId },
    data: { openChats: cur.items.filter((c) => !(c.bookingId === b.id && c.messageId === params.messageId)) as unknown as object },
  });
  await logAudit({
    organizationId: params.organizationId, userId: params.actor.userId, action: "guest.chat.done",
    entityType: "Booking", entityId: b.id, details: { ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return { bookingId: b.id, messageId: params.messageId };
}
