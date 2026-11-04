import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, preview, bestaetigtSchema, ToolError, type ToolContext } from "../tool";
import { day, addDays, todayVienna, channelGroup } from "../format";
import { wohnungFilter, resolveApartmentId } from "../shared";
import { petFee, PET_FEE_LABEL, PET_FEE_PER_NIGHT, portalCollectsPetFee } from "../../pets";
import { scanBookingForDogs, setPetFeeStatus, petFeeDraft, requestPetFee, setPets } from "../../pet-actions";
import { ActionError } from "../../booking-actions";
import { GuestMessageError } from "../../guest-messages";

// ─── Hunde und Hundegebühr ────────────────────────────────────────────────────
// 15 € pro Hund und Nacht. Airbnb kassiert selbst; bei Booking.com und Direktbuchungen
// wird die Gebühr per Nachricht angefordert (Entscheidung Mathias 30.10.2026).

const via = (ctx: ToolContext) => ({ via: `mcp:${ctx.tokenName}` });
const buchungId = z.string().min(1).describe("ID der Buchung (aus hunde_uebersicht, buchungen_list oder wochenplan)");

async function act<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ActionError || err instanceof GuestMessageError) throw new ToolError(err.message);
    throw err;
  }
}

function zeile(b: {
  id: string; guestName: string; checkIn: Date; checkOut: Date; channelName: string | null;
  petCount: number | null; petSource: string | null; petHint: string | null;
  petFeeStatus: string | null; petFeeAmount: number | null; apartment: { name: string };
}) {
  const fee = petFee(b);
  return {
    buchung_id: b.id,
    wohnung: b.apartment.name,
    gast: b.guestName,
    anreise: day(b.checkIn),
    abreise: day(b.checkOut),
    kanal: channelGroup(b.channelName),
    hunde: b.petCount ?? 0,
    erkannt_aus: b.petSource === "manual" ? "Eingabe" : b.petSource === "notice" ? "Portalnotiz" : b.petSource === "chat" ? "Gästechat" : null,
    ...(b.petHint ? { fundstelle: b.petHint } : {}),
    naechte: fee.nights,
    gebuehr: fee.amount,
    gebuehr_status: PET_FEE_LABEL[fee.state],
  };
}

const SELECT = {
  id: true, guestName: true, checkIn: true, checkOut: true, channelName: true, petCount: true, petSource: true, petHint: true,
  petFeeStatus: true, petFeeAmount: true, apartment: { select: { name: true } },
} as const;

// ─── hunde_uebersicht ─────────────────────────────────────────────────────────

export const hundeUebersicht = defineTool({
  name: "hunde_uebersicht",
  title: "Hunde und Hundegebühren",
  description:
    `Listet aktuelle und kommende Buchungen mit Hund samt Hundegebühr (${PET_FEE_PER_NIGHT} € pro Hund und Nacht) und deren Stand: ` +
    "kassiert das Portal (Airbnb), noch nicht angefordert, angefordert, bezahlt, erlassen. Für „Welche Hundegebühren sind offen?“.",
  scope: "bookings:read",
  input: {
    tage: z.number().int().min(1).max(400).optional().describe("Anreisen bis so viele Tage ab heute (Vorgabe 120)"),
    wohnung: wohnungFilter,
  },
  async handler(args, ctx) {
    const today = todayVienna();
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const rows = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        petCount: { gt: 0 },
        ...(apartmentId ? { apartmentId } : {}),
        checkOut: { gte: today },
        checkIn: { lt: addDays(today, (args.tage ?? 120) + 1) },
      },
      orderBy: { checkIn: "asc" },
      select: SELECT,
    });
    const liste = rows.map(zeile);
    const offen = liste.filter((r) => r.gebuehr_status === PET_FEE_LABEL.OFFEN || r.gebuehr_status === PET_FEE_LABEL.ANGEFORDERT);
    return {
      anzahl: liste.length,
      offen_summe: offen.reduce((s, r) => s + r.gebuehr, 0),
      buchungen: liste,
      hinweis: "Hunde bei Booking.com-Buchungen erkennt die App nur aus Portalnotiz und Gästechat — hunde_pruefen durchsucht die Chats.",
    };
  },
});

// ─── hunde_pruefen ────────────────────────────────────────────────────────────

export const hundePruefen = defineTool({
  name: "hunde_pruefen",
  title: "Chats auf Hunde prüfen",
  description:
    "Durchsucht Portalnotiz und Gästechat der kommenden Buchungen, bei denen das Portal die Hundegebühr nicht selbst kassiert (v.a. Booking.com), " +
    "nach Hinweisen auf Hunde. Ohne bestaetigt nur Ergebnis zeigen; mit bestaetigt: true die erkannte Hundezahl eintragen " +
    "(eine von Hand eingetragene Zahl wird nie überschrieben). Fragt Smoobu je Buchung ab (höchstens 25).",
  scope: "messages:read",
  write: true,
  input: {
    tage: z.number().int().min(1).max(400).optional().describe("Anreisen bis so viele Tage ab heute (Vorgabe 120)"),
    wohnung: wohnungFilter,
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const today = todayVienna();
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const MAX = 25;
    const rows = (
      await prisma.booking.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "confirmed",
          smoobuId: { not: null },
          ...(apartmentId ? { apartmentId } : {}),
          checkOut: { gte: today },
          checkIn: { lt: addDays(today, (args.tage ?? 120) + 1) },
        },
        orderBy: { checkIn: "asc" },
        select: SELECT,
      })
    ).filter((b) => !portalCollectsPetFee(b.channelName));

    const funde = [];
    const fehler = [];
    for (const b of rows.slice(0, MAX)) {
      try {
        const r = await scanBookingForDogs({ organizationId: ctx.organizationId, bookingId: b.id, actor: via(ctx), withChat: true, dryRun: !args.bestaetigt });
        if (r.detection) {
          funde.push({
            buchung_id: b.id, wohnung: b.apartment.name, gast: b.guestName, anreise: day(b.checkIn), kanal: channelGroup(b.channelName),
            hunde_erkannt: r.detection.count, bisher: b.petCount ?? 0, quelle: r.source === "chat" ? "Gästechat" : "Portalnotiz",
            fundstelle: r.detection.hint,
            ...(r.skippedManual ? { hinweis: "von Hand eingetragen — bleibt unverändert" } : {}),
            ...(args.bestaetigt ? { eingetragen: r.changed } : { wuerde_eintragen: r.wouldChange }),
          });
        }
      } catch (err) {
        fehler.push({ buchung_id: b.id, gast: b.guestName, fehler: err instanceof Error ? err.message : String(err) });
      }
    }
    const result = {
      geprueft: Math.min(rows.length, MAX),
      ...(rows.length > MAX ? { hinweis_umfang: `Mehr als ${MAX} Buchungen — nur die ersten ${MAX} geprüft. Zeitraum verkürzen.` } : {}),
      funde,
      ...(fehler.length ? { fehler } : {}),
    };
    if (!args.bestaetigt) {
      return preview(`${funde.filter((f) => "wuerde_eintragen" in f && f.wuerde_eintragen).length} Buchung(en) würden einen Hund eingetragen bekommen.`, result);
    }
    return { ausgefuehrt: true, ...result };
  },
});

// ─── hunde_eintragen ──────────────────────────────────────────────────────────

export const hundeEintragen = defineTool({
  name: "hunde_eintragen",
  title: "Hundezahl eintragen",
  description: "Trägt die Zahl der Hunde einer Buchung von Hand ein (0 = kein Hund, null = unbekannt). Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    buchung_id: buchungId,
    hunde: z.number().int().min(0).max(9).nullable(),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await prisma.booking.findFirst({ where: { id: args.buchung_id, organizationId: ctx.organizationId }, select: SELECT });
    if (!b) throw new ToolError(`Buchung ${args.buchung_id} nicht gefunden`);
    if (!args.bestaetigt) {
      return preview(`Hunde bei ${b.guestName} (${b.apartment.name}, Anreise ${day(b.checkIn)}): ${b.petCount ?? "unbekannt"} → ${args.hunde ?? "unbekannt"}.`, zeile({ ...b, petCount: args.hunde }));
    }
    const r = await act(() => setPets({ organizationId: ctx.organizationId, bookingId: b.id, count: args.hunde, source: "manual", actor: via(ctx) }));
    return { ausgefuehrt: true, ...zeile(r.booking) };
  },
});

// ─── hundegebuehr_anfordern ───────────────────────────────────────────────────

export const hundegebuehrAnfordern = defineTool({
  name: "hundegebuehr_anfordern",
  title: "Hundegebühr beim Gast anfordern",
  description:
    `Schickt dem Gast über Smoobu die Bitte, die Hundegebühr (${PET_FEE_PER_NIGHT} € pro Hund und Nacht) zu bezahlen, und setzt den Stand auf „angefordert“. ` +
    "Ohne text wird ein Vorschlag erzeugt. Erst OHNE bestaetigt aufrufen und Mathias den genauen Text zeigen; nach seiner Zustimmung mit bestaetigt: true senden. " +
    "Nicht für Airbnb (kassiert selbst).",
  scope: "messages:write",
  write: true,
  input: {
    buchung_id: buchungId,
    text: z.string().trim().min(1).max(5000).optional().describe("Nachrichtentext; leer = Vorschlag der App verwenden"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const draft = await act(() => petFeeDraft(ctx.organizationId, args.buchung_id));
    const text = args.text ?? draft.text;
    if (!args.bestaetigt) {
      return preview(`Hundegebühr ${draft.fee.amount} € bei ${draft.booking.guestName} anfordern (Nachricht über Smoobu, danach Stand „angefordert“).`, {
        ...zeile(draft.booking),
        text,
        ...(draft.paymentConfigured ? {} : { achtung: "Zahlungsweg fehlt (PET_FEE_PAYMENT_TEXT nicht gesetzt) — Platzhalter im Text ersetzen." }),
      });
    }
    const updated = await act(() => requestPetFee({ organizationId: ctx.organizationId, bookingId: args.buchung_id, text, actor: via(ctx) }));
    return { ausgefuehrt: true, gesendet: true, ...zeile(updated) };
  },
});

// ─── hundegebuehr_status ──────────────────────────────────────────────────────

const STATUS = { bezahlt: "PAID", erlassen: "WAIVED", angefordert: "REQUESTED", offen: null } as const;

export const hundegebuehrStatus = defineTool({
  name: "hundegebuehr_status",
  title: "Stand der Hundegebühr setzen",
  description:
    "Setzt den Stand der Hundegebühr: bezahlt, erlassen, angefordert (z.B. außerhalb der App angefordert) oder offen (zurücksetzen). " +
    "Optional abweichender Betrag. Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    buchung_id: buchungId,
    status: z.enum(["bezahlt", "erlassen", "angefordert", "offen"]),
    betrag: z.number().min(0).max(10000).optional().describe("Abweichender Betrag in Euro"),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const b = await prisma.booking.findFirst({ where: { id: args.buchung_id, organizationId: ctx.organizationId }, select: SELECT });
    if (!b) throw new ToolError(`Buchung ${args.buchung_id} nicht gefunden`);
    const vorher = zeile(b);
    if (!args.bestaetigt) {
      return preview(`Hundegebühr ${b.guestName}: ${vorher.gebuehr_status} → ${args.status}${args.betrag !== undefined ? ` (${args.betrag} €)` : ""}.`, vorher);
    }
    const updated = await act(() =>
      setPetFeeStatus({
        organizationId: ctx.organizationId,
        bookingId: b.id,
        status: STATUS[args.status],
        ...(args.betrag !== undefined ? { amount: args.betrag } : {}),
        actor: via(ctx),
      })
    );
    return { ausgefuehrt: true, ...zeile(updated) };
  },
});
