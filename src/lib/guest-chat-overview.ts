import { prisma } from "./prisma";
import { fetchGuestMessages, lastMessage } from "./guest-messages";
import { addDays, todayVienna } from "./mcp/format";

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
      apartment: { select: { name: true } },
    },
  });

  const open: { booking: (typeof rows)[number]; last: { text: string; betreff: string | null } }[] = [];
  const errors: { booking: (typeof rows)[number]; error: string }[] = [];
  for (const b of rows.slice(0, MAX_CHATS)) {
    try {
      const { messages } = await fetchGuestMessages(b.smoobuId as number, 3);
      const last = lastMessage(messages);
      if (last?.von === "gast") open.push({ booking: b, last: { text: last.text, betreff: last.betreff } });
    } catch (err) {
      errors.push({ booking: b, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { checked: Math.min(rows.length, MAX_CHATS), truncated: rows.length > MAX_CHATS, open, errors };
}
