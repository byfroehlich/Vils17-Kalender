import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, ToolError } from "../tool";
import { day, addDays, nightsBetween, channelGroup, todayVienna, parseDay } from "../format";
import { datum } from "../shared";
import { isGuestCountUnconfirmed } from "../../guest-count";

// ─── Feriengast-Assistent (Theo per WhatsApp) ─────────────────────────────────
// Entscheidung Mathias 09.11.2026: Gäste dürfen Theo direkt anschreiben. Theo darf
// nur freie/belegte Zeiträume sehen (ohne Namen) und die EIGENE Buchung eines Gastes.
// Eigener Scope „gast:read“, damit das Token des Assistenten nichts anderes kann.

/** Zuordnung endet 14 Tage nach Abreise. */
export const GAST_NACHLAUF_TAGE = 14;
const MAX_TAGE = 400;

/** Nur Ziffern, ohne internationale Vorwahl-Nullen; verglichen werden die letzten 9 Stellen. */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 8 ? digits.slice(-9) : null;
}

/** Klein, ohne Akzente/Umlaut-Varianten, nur Buchstaben als Wörter. */
function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

/** Nachname muss passen: letztes Wort gleich – oder bei mehreren Wörtern kommen alle im Buchungsnamen vor. */
export function nameMatches(given: string, guestName: string): boolean {
  const g = nameWords(given);
  const b = nameWords(guestName);
  if (!g.length || !b.length) return false;
  if (g[g.length - 1] === b[b.length - 1]) return true;
  return g.length >= 2 && g.every((w) => b.includes(w));
}

// ─── gast_verfuegbarkeit ──────────────────────────────────────────────────────

export const gastVerfuegbarkeit = defineTool({
  name: "gast_verfuegbarkeit",
  title: "Frei / belegt (für Gäste)",
  description:
    "Freie und belegte Zeiträume je Wohnung, ohne Namen und Preise — für Anfragen von Gästen („Ist vom 3. bis 7. März etwas frei?“). " +
    "belegt: von = Anreisetag, bis = Abreisetag (an diesem Tag kann der nächste Gast anreisen).",
  scope: "gast:read",
  input: {
    von: datum.optional().describe("Erster Tag JJJJ-MM-TT (Vorgabe: heute)"),
    bis: datum.optional().describe(`Letzter Tag JJJJ-MM-TT (Vorgabe: von + 180 Tage, höchstens ${MAX_TAGE} Tage)`),
  },
  async handler(args, ctx) {
    const start = args.von ? parseDay(args.von) : todayVienna();
    const end = args.bis ? addDays(parseDay(args.bis), 1) : addDays(start, 181);
    if (end <= start) throw new ToolError("bis liegt vor von.");
    if (nightsBetween(start, end) > MAX_TAGE) throw new ToolError(`Höchstens ${MAX_TAGE} Tage auf einmal.`);

    const apts = await prisma.apartment.findMany({
      where: { organizationId: ctx.organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        apartmentId: { in: apts.map((a) => a.id) },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      orderBy: { checkIn: "asc" },
      select: { apartmentId: true, checkIn: true, checkOut: true },
    });

    return {
      zeitraum: { von: day(start), bis: day(addDays(end, -1)) },
      wohnungen: apts.map((apt) => {
        const own = bookings.filter((b) => b.apartmentId === apt.id);
        const occupied = new Set<string>();
        for (const b of own) for (let d = new Date(b.checkIn); d < b.checkOut; d = addDays(d, 1)) occupied.add(day(d));
        const frei: { von: string; bis: string; naechte: number }[] = [];
        let run: Date | null = null;
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
          const free = d < end && !occupied.has(day(d));
          if (free && !run) run = new Date(d);
          if (!free && run) {
            frei.push({ von: day(run), bis: day(d), naechte: nightsBetween(run, d) });
            run = null;
          }
        }
        return {
          wohnung: apt.name,
          belegt: own.map((b) => ({ von: day(b.checkIn), bis: day(b.checkOut) })),
          frei,
        };
      }),
      hinweis: "frei: von = frühester Anreisetag, bis = spätester Abreisetag dieser Lücke.",
    };
  },
});

// ─── gast_buchung ─────────────────────────────────────────────────────────────

export const gastBuchung = defineTool({
  name: "gast_buchung",
  title: "Eigene Buchung eines Gastes",
  description:
    "Findet die Buchung eines Gastes — entweder über seine Telefonnummer (wie in der Buchung hinterlegt) oder über " +
    "Name + Anreisetag + (Buchungsnummer ODER E-Mail). Name und Anreise allein reichen nicht. Nur bestätigte Buchungen, " +
    `bis ${GAST_NACHLAUF_TAGE} Tage nach Abreise. Liefert keine Preise und keine Kontaktdaten.`,
  scope: "gast:read",
  input: {
    telefon: z.string().max(30).optional().describe("Telefonnummer des Gastes (beliebiges Format)"),
    name: z.string().max(80).optional().describe("Name des Gastes (Nachname muss passen)"),
    anreise: datum.optional().describe("Anreisetag JJJJ-MM-TT"),
    buchungsnummer: z.string().max(40).optional().describe("Buchungsnummer (Smoobu-Nummer)"),
    email: z.string().max(120).optional().describe("E-Mail-Adresse aus der Buchung"),
  },
  async handler(args, ctx) {
    const ab = addDays(todayVienna(), -GAST_NACHLAUF_TAGE);
    const base = { organizationId: ctx.organizationId, status: "confirmed", checkOut: { gte: ab } };
    const select = {
      id: true, smoobuId: true, guestName: true, guestPhone: true, guestEmail: true, guestCount: true,
      guestCountManual: true, guestCountUnknown: true, petCount: true, checkIn: true, checkOut: true,
      arrivalTime: true, departureTime: true, channelName: true, apartment: { select: { name: true } },
    } as const;

    let rows;
    let weg: "telefon" | "nachweis";
    const key = args.telefon ? phoneKey(args.telefon) : null;
    if (args.telefon) {
      if (!key) throw new ToolError("Telefonnummer zu kurz.");
      const all = await prisma.booking.findMany({ where: { ...base, guestPhone: { not: null } }, select, orderBy: { checkIn: "asc" } });
      rows = all.filter((b) => phoneKey(b.guestPhone) === key);
      weg = "telefon";
    } else {
      if (!args.name || !args.anreise || !(args.buchungsnummer || args.email)) {
        throw new ToolError("Ohne Telefonnummer: name, anreise und buchungsnummer oder email angeben.");
      }
      const ci = parseDay(args.anreise);
      const all = await prisma.booking.findMany({ where: { ...base, checkIn: ci }, select, orderBy: { checkIn: "asc" } });
      const nr = args.buchungsnummer?.replace(/\D/g, "");
      const mail = args.email?.trim().toLowerCase();
      rows = all.filter(
        (b) =>
          nameMatches(args.name!, b.guestName) &&
          ((!!nr && b.smoobuId != null && String(b.smoobuId) === nr) ||
            (!!mail && !!b.guestEmail && b.guestEmail.trim().toLowerCase() === mail))
      );
      weg = "nachweis";
    }

    return {
      zuordnung: weg,
      treffer: rows.length,
      buchungen: rows.map((b) => ({
        id: b.id,
        buchungsnummer: b.smoobuId,
        wohnung: b.apartment.name,
        vorname: b.guestName.trim().split(/\s+/)[0] ?? "",
        check_in: day(b.checkIn),
        check_out: day(b.checkOut),
        naechte: nightsBetween(b.checkIn, b.checkOut),
        anreise_ab: b.arrivalTime,
        abreise_bis: b.departureTime,
        personen: b.guestCount,
        gaestezahl_bestaetigt: !isGuestCountUnconfirmed(b),
        hunde: b.petCount ?? 0,
        kanal: channelGroup(b.channelName),
        zuordnung_bis: day(addDays(b.checkOut, GAST_NACHLAUF_TAGE)),
      })),
    };
  },
});
