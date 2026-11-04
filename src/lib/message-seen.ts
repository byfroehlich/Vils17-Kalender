import { prisma } from "./prisma";
import type { GuestMessage } from "./guest-messages";

// Entscheidung Mathias 31.10.2026: Bei Gästenachrichten muss sichtbar sein, wann sie kamen.
// Smoobu liefert (laut Doku) keinen Zeitpunkt je Nachricht. Liefert die Antwort doch einen (`zeit`), gilt der;
// sonst merkt sich die App, wann sie eine Nachricht zum ersten Mal gesehen hat (App-Takt alle 30 Min →
// „spätestens“). Nachrichten, die beim allerersten Abruf eines Chats schon da waren, haben keinen Zeitpunkt.

export type MessageTime = { at: Date | null; approx: boolean };

export async function recordSeen(organizationId: string, bookingId: string, messages: GuestMessage[]): Promise<Map<string, MessageTime>> {
  const ids = messages.map((m) => m.id);
  const out = new Map<string, MessageTime>();
  if (!ids.length) return out;
  const known = await prisma.guestMessageSeen.findMany({ where: { organizationId, bookingId } });
  const byId = new Map(known.map((k) => [k.messageId, k]));
  const initial = known.length === 0;
  const fresh = ids.filter((id) => !byId.has(id));
  if (fresh.length) {
    await prisma.guestMessageSeen.createMany({
      data: fresh.map((messageId) => ({ organizationId, bookingId, messageId, initial })),
      skipDuplicates: true,
    });
    const now = new Date();
    for (const id of fresh) byId.set(id, { id: "", organizationId, bookingId, messageId: id, firstSeenAt: now, initial });
  }
  for (const m of messages) {
    if (m.zeit) { out.set(m.id, { at: new Date(m.zeit), approx: false }); continue; }
    const k = byId.get(m.id);
    out.set(m.id, k && !k.initial ? { at: k.firstSeenAt, approx: true } : { at: null, approx: true });
  }
  return out;
}

/** „Sa 31.10. 09:12“, „spätestens Sa 31.10. 09:12“ oder „Zeit unbekannt“ (Europe/Vienna) */
export function formatMessageTime(t: MessageTime | null | undefined): string {
  if (!t?.at) return "Zeit unbekannt (älter)";
  const s = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t.at).replaceAll(",", "");
  return t.approx ? `eingegangen spätestens ${s}` : `eingegangen ${s}`;
}
