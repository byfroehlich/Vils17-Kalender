import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema, ToolError, type ToolContext } from "../tool";
import { day, addDays, todayVienna, channelGroup } from "../format";
import { wohnungFilter, resolveApartmentId } from "../shared";
import { fetchGuestMessages, sendGuestMessage, lastMessage, GuestMessageError } from "../../guest-messages";
import { logAudit } from "../../audit";

// ─── Gästenachrichten (Smoobu) ────────────────────────────────────────────────
// Lesen: messages:read. Antworten: messages:write, nur mit "bestaetigt": true.
// Nachrichtentexte sind personenbezogen — sie landen nie im Audit-Log
// (sanitizeForAudit ersetzt Freitext; das App-Audit hält nur Länge und Buchung fest).

const buchungId = z.string().min(1).describe("ID der Buchung (aus buchungen_list, anreisen_abreisen oder offene_gaestenachrichten)");

async function loadBooking(ctx: ToolContext, id: string) {
  const b = await prisma.booking.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true, smoobuId: true, guestName: true, checkIn: true, checkOut: true, channelName: true, status: true,
      apartment: { select: { name: true } },
    },
  });
  if (!b) throw new ToolError(`Buchung ${id} nicht gefunden`);
  if (!b.smoobuId) throw new ToolError("Diese Buchung stammt nicht aus Smoobu — dort gibt es keinen Chat.");
  return b as typeof b & { smoobuId: number };
}

/** Smoobu-Fehler → verständliche Tool-Fehler */
async function smoobu<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GuestMessageError) throw new ToolError(err.message);
    throw err;
  }
}

const kopf = (b: Awaited<ReturnType<typeof loadBooking>>) => ({
  buchung_id: b.id,
  wohnung: b.apartment.name,
  gast: b.guestName,
  anreise: day(b.checkIn),
  abreise: day(b.checkOut),
  kanal: channelGroup(b.channelName),
});

// ─── gaeste_nachrichten ───────────────────────────────────────────────────────

export const gaesteNachrichten = defineTool({
  name: "gaeste_nachrichten",
  title: "Gästechat lesen",
  description:
    "Liest den Chat mit dem Gast einer Buchung aus Smoobu (Airbnb, Booking.com und Direktbuchungen laufen dort zusammen). " +
    "Für „Was hat der Gast geschrieben?“ und bevor eine Antwort formuliert wird. wartet_auf_antwort = letzte Nachricht kam vom Gast.",
  scope: "messages:read",
  input: {
    buchung_id: buchungId,
    letzte: z.number().int().min(1).max(50).optional().describe("Nur die letzten N Nachrichten (Vorgabe 20)"),
  },
  async handler(args, ctx) {
    const b = await loadBooking(ctx, args.buchung_id);
    const { messages, complete } = await smoobu(() => fetchGuestMessages(b.smoobuId));
    const last = lastMessage(messages);
    const n = args.letzte ?? 20;
    return {
      ...kopf(b),
      anzahl: messages.length,
      vollstaendig: complete,
      wartet_auf_antwort: last?.von === "gast",
      nachrichten: messages.slice(-n),
    };
  },
});

// ─── offene_gaestenachrichten ─────────────────────────────────────────────────

export const offeneGaestenachrichten = defineTool({
  name: "offene_gaestenachrichten",
  title: "Unbeantwortete Gästenachrichten",
  description:
    "Prüft die Chats aller aktuellen und kommenden Buchungen (Vorgabe: Abreise ab heute, Anreise in den nächsten 30 Tagen) und " +
    "listet die, bei denen die letzte Nachricht vom Gast kommt — also eine Antwort fehlt. Für „Muss ich jemandem antworten?“. " +
    "Fragt Smoobu je Buchung einzeln ab (höchstens 25 Buchungen).",
  scope: "messages:read",
  input: {
    tage: z.number().int().min(1).max(120).optional().describe("Anreisen bis so viele Tage ab heute einbeziehen (Vorgabe 30)"),
    wohnung: wohnungFilter,
  },
  async handler(args, ctx) {
    const today = todayVienna();
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const MAX = 25;
    const rows = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        smoobuId: { not: null },
        ...(apartmentId ? { apartmentId } : {}),
        checkOut: { gte: today },
        checkIn: { lt: addDays(today, (args.tage ?? 30) + 1) },
      },
      orderBy: { checkIn: "asc" },
      take: MAX + 1,
      select: {
        id: true, smoobuId: true, guestName: true, checkIn: true, checkOut: true, channelName: true, status: true,
        apartment: { select: { name: true } },
      },
    });

    const offen = [];
    const fehler = [];
    for (const b of rows.slice(0, MAX)) {
      try {
        const { messages } = await fetchGuestMessages(b.smoobuId as number, 3);
        const last = lastMessage(messages);
        if (last?.von === "gast") {
          offen.push({ ...kopf(b as Awaited<ReturnType<typeof loadBooking>>), letzte_nachricht: last.text.slice(0, 500), betreff: last.betreff });
        }
      } catch (err) {
        fehler.push({ buchung_id: b.id, gast: b.guestName, fehler: err instanceof Error ? err.message : String(err) });
      }
    }
    return {
      geprueft: Math.min(rows.length, MAX),
      ...(rows.length > MAX ? { hinweis: `Mehr als ${MAX} Buchungen im Zeitraum — nur die ersten ${MAX} geprüft. Zeitraum verkürzen.` } : {}),
      unbeantwortet: offen.length,
      buchungen: offen,
      ...(fehler.length ? { fehler } : {}),
    };
  },
});

// ─── gast_antworten ───────────────────────────────────────────────────────────

export const gastAntworten = defineTool({
  name: "gast_antworten",
  title: "Gast antworten",
  description:
    "Schickt dem Gast einer Buchung eine Nachricht über Smoobu (landet im Chat des Portals bzw. per E-Mail). " +
    "Erst OHNE bestaetigt aufrufen und Mathias den genauen Text zeigen; erst nach seiner ausdrücklichen Zustimmung mit bestaetigt: true senden. " +
    "Gesendet ist gesendet — es gibt kein Zurückholen.",
  scope: "messages:write",
  write: true,
  input: {
    buchung_id: buchungId,
    text: z.string().trim().min(1).max(5000).describe("Nachrichtentext (reiner Text; Zeilenumbrüche erlaubt)"),
    betreff: z.string().trim().max(200).optional().describe("Betreff (optional; Portale zeigen ihn meist nicht)"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await loadBooking(ctx, args.buchung_id);
    if (b.status !== "confirmed") throw new ToolError("Die Buchung ist storniert — keine Nachricht über die Schnittstelle.");

    if (!args.bestaetigt) {
      return preview(`Nachricht an ${b.guestName} (${b.apartment.name}, Anreise ${day(b.checkIn)}, ${channelGroup(b.channelName)}) senden.`, {
        ...kopf(b),
        betreff: args.betreff ?? null,
        text: args.text,
      });
    }

    await smoobu(() => sendGuestMessage(b.smoobuId, args.text, args.betreff));
    await logAudit({
      organizationId: ctx.organizationId,
      action: "guest.message.sent",
      entityType: "Booking",
      entityId: b.id,
      details: { via: `mcp:${ctx.tokenName}`, zeichen: args.text.length },
    });
    return { ausgefuehrt: true, gesendet: true, ...kopf(b) };
  },
});
