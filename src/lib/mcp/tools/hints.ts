import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema, ToolError, type ToolContext } from "../tool";
import { day } from "../format";
import { ActionError } from "../../booking-actions";
import { listNoteSuggestions, acceptNoteSuggestion, rejectNoteSuggestion, scanNoteSuggestions } from "../../note-suggestions";

// ─── Hinweise für die Reinigung aus dem Gästechat ─────────────────────────────
// Entscheidung Mathias 31.10.2026: EIN Feld (CleaningAssignment.notes). Sonderwünsche aus den
// Gästechats werden als Vorschlag erkannt; erst „übernehmen“ schreibt sie in den Auftrag.

const via = (ctx: ToolContext) => ({ via: `mcp:${ctx.tokenName}` });

export const hinweisVorschlaege = defineTool({
  name: "hinweis_vorschlaege",
  title: "Erkannte Sonderwünsche (Hinweise für die Reinigung)",
  description:
    "Listet die aus Gästechats erkannten Sonderwünsche (Kinderbett, Hochstuhl, Zustellbett, getrennt schlafen, früher Check-in …), " +
    "die noch bestätigt werden müssen: Vorschlagstext, Auszug aus der Gästenachricht, vorgeschlagene Zusatzbetten, bisheriger Hinweis. " +
    "Mit neu_pruefen: true werden die Chats vorher sofort durchsucht (sonst automatisch alle 30 Min). Danach hinweis_uebernehmen.",
  scope: "messages:read",
  input: {
    neu_pruefen: z.boolean().optional().describe("Chats jetzt durchsuchen statt auf den automatischen Lauf zu warten"),
  },
  async handler(args, ctx) {
    const scan = args.neu_pruefen ? await scanNoteSuggestions(ctx.organizationId, { force: true }) : null;
    const rows = await listNoteSuggestions(ctx.organizationId);
    return {
      anzahl: rows.length,
      ...(scan ? { geprueft: { chats: scan.scanned, neu: scan.created, fehler: scan.errors } } : {}),
      vorschlaege: rows.map((s) => ({
        vorschlag_id: s.id,
        buchung_id: s.booking.id,
        wohnung: s.booking.apartment.name,
        gast: s.booking.guestName,
        anreise: day(s.booking.checkIn),
        vorschlag: s.proposedText,
        auszug: s.excerpt,
        zusatzbetten_vorschlag: s.extraBeds,
        bisheriger_hinweis: s.booking.cleaningAssignment?.notes?.trim() || null,
        zusatzbetten_bisher: s.booking.cleaningAssignment?.extraBeds ?? 0,
        reinigung: s.booking.cleaningAssignment?.cleaner?.name ?? null,
      })),
    };
  },
});

export const hinweisUebernehmen = defineTool({
  name: "hinweis_uebernehmen",
  title: "Sonderwunsch übernehmen oder verwerfen",
  description:
    "Übernimmt einen Vorschlag aus hinweis_vorschlaege in den „Hinweis für die Reinigung“ (wird angehängt, Reinigungskraft bekommt eine Push-Nachricht) " +
    "— optional mit geändertem Text und Zusatzbetten (0–3, zählen in der Wäscheplanung). Mit verwerfen: true wird der Vorschlag verworfen. " +
    "Ohne bestaetigt nur Vorschau.",
  scope: "cleaning:write",
  write: true,
  input: {
    vorschlag_id: z.string().min(1).describe("ID aus hinweis_vorschlaege"),
    text: z.string().trim().min(1).max(500).optional().describe("Geänderter Hinweistext (Vorgabe: Vorschlag)"),
    zusatzbetten: z.number().int().min(0).max(3).optional().describe("Zusatzbetten für diese Anreise (Vorgabe: Vorschlag)"),
    verwerfen: z.boolean().optional().describe("true = Vorschlag verwerfen statt übernehmen"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const s = await prisma.noteSuggestion.findFirst({
      where: { id: args.vorschlag_id, organizationId: ctx.organizationId },
      include: { booking: { select: { id: true, guestName: true, checkIn: true, apartment: { select: { name: true } }, cleaningAssignment: { select: { notes: true, extraBeds: true } } } } },
    });
    if (!s) throw new ToolError("Vorschlag nicht gefunden");
    if (s.status !== "PENDING") throw new ToolError("Vorschlag wurde schon entschieden");
    const ziel = { buchung_id: s.booking.id, wohnung: s.booking.apartment.name, anreise: day(s.booking.checkIn) };

    if (args.verwerfen) {
      if (!args.bestaetigt) return preview("Vorschlag verwerfen (Hinweis bleibt unverändert)", { ...ziel, vorschlag: s.proposedText });
      try {
        await rejectNoteSuggestion({ organizationId: ctx.organizationId, id: s.id, actor: via(ctx) });
      } catch (e) {
        if (e instanceof ActionError) throw new ToolError(e.message);
        throw e;
      }
      return { ausgefuehrt: true, verworfen: true, ...ziel };
    }

    const text = args.text ?? s.proposedText;
    const bisher = s.booking.cleaningAssignment?.notes?.trim() || null;
    if (!args.bestaetigt) {
      return preview("Hinweis für die Reinigung ergänzen und Reinigungskraft benachrichtigen", {
        ...ziel,
        hinweis_bisher: bisher,
        hinweis_neu: bisher ? (bisher.toLowerCase().includes(text.toLowerCase()) ? bisher : `${bisher}\n${text}`) : text,
        zusatzbetten: args.zusatzbetten ?? Math.max(s.extraBeds, s.booking.cleaningAssignment?.extraBeds ?? 0),
      });
    }
    try {
      const r = await acceptNoteSuggestion({ organizationId: ctx.organizationId, id: s.id, text: args.text ?? null, extraBeds: args.zusatzbetten ?? null, actor: via(ctx) });
      return { ausgefuehrt: true, ...ziel, hinweis: r.notes, zusatzbetten: r.extraBeds, reinigungskraft_benachrichtigt: r.notified };
    } catch (e) {
      if (e instanceof ActionError) throw new ToolError(e.message);
      throw e;
    }
  },
});
