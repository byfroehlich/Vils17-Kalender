import { z } from "zod";
import { prisma } from "../prisma";
import { ToolError } from "./tool";
import { addDays, parseDay, todayVienna, monthKey, DEFAULT_LIMIT, MAX_LIMIT, decodeCursor, encodeCursor } from "./format";

// ─── Gemeinsame Eingabefelder ─────────────────────────────────────────────────

export const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format JJJJ-MM-TT");
export const monat = z.string().regex(/^\d{4}-\d{2}$/, "Format JJJJ-MM");

export const wohnungFilter = z
  .string()
  .optional()
  .describe('Wohnung: ID oder Teil des Namens, z.B. "Lodge" oder "Penthouse". Leer = alle.');

export const pagingFields = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Anzahl Einträge (Vorgabe ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
  cursor: z.string().optional().describe("Cursor aus naechster_cursor der vorherigen Antwort"),
};

export const monthPeriodFields = {
  jahr: z.number().int().min(2020).max(2100).optional().describe("Kalenderjahr, z.B. 2026 (Vorgabe: aktuelles Jahr)"),
  von_monat: monat.optional().describe("Erster Monat JJJJ-MM (statt jahr)"),
  bis_monat: monat.optional().describe("Letzter Monat JJJJ-MM, einschließlich (statt jahr)"),
};

// ─── Auflösen ─────────────────────────────────────────────────────────────────

/** Wohnungsfilter → Apartment-ID (oder undefined für alle). */
export async function resolveApartmentId(organizationId: string, filter?: string): Promise<string | undefined> {
  if (!filter) return undefined;
  const apts = await prisma.apartment.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const exact = apts.find((a) => a.id === filter);
  if (exact) return exact.id;
  const hits = apts.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()));
  if (hits.length === 1) return hits[0].id;
  if (hits.length === 0) throw new ToolError(`Keine Wohnung passt zu "${filter}". Verfügbar: ${apts.map((a) => a.name).join(", ")}`);
  throw new ToolError(`"${filter}" ist mehrdeutig: ${hits.map((a) => a.name).join(", ")}`);
}

/** Monatsbereich aus jahr / von_monat / bis_monat → [Start, Ende) als Kalendertage + Liste der Monate. */
export function resolveMonths(args: { jahr?: number; von_monat?: string; bis_monat?: string }) {
  const thisYear = Number(todayVienna().toISOString().slice(0, 4));
  let from: string;
  let to: string;
  if (args.von_monat || args.bis_monat) {
    from = args.von_monat ?? args.bis_monat!;
    to = args.bis_monat ?? args.von_monat!;
  } else {
    const y = args.jahr ?? thisYear;
    from = `${y}-01`;
    to = `${y}-12`;
  }
  if (to < from) throw new ToolError("bis_monat liegt vor von_monat");

  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= to) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (months.length > 60) throw new ToolError("Zeitraum zu lang (max. 60 Monate)");
  }

  const start = parseDay(`${from}-01`);
  const [ly, lm] = to.split("-").map(Number);
  const end = new Date(Date.UTC(lm === 12 ? ly + 1 : ly, lm === 12 ? 0 : lm, 1));
  return { start, end, months };
}

/** Tageszeitraum aus von/bis (bis einschließlich) mit Vorgaben. */
export function resolveDays(von?: string, bis?: string, defaultDays = 90) {
  const start = von ? parseDay(von) : todayVienna();
  const endInclusive = bis ? parseDay(bis) : addDays(start, defaultDays - 1);
  if (endInclusive < start) throw new ToolError("bis liegt vor von");
  if ((endInclusive.getTime() - start.getTime()) / 86_400_000 > 3660) throw new ToolError("Zeitraum zu lang (max. 10 Jahre)");
  return { start, endExclusive: addDays(endInclusive, 1) };
}

/**
 * Nächte einer Buchung, aufgeteilt auf Monate — nur innerhalb [start, end).
 * Liefert z.B. { "2026-10": 2, "2026-11": 1 }.
 */
export function nightsPerMonth(checkIn: Date, checkOut: Date, start?: Date, end?: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (let d = new Date(checkIn); d < checkOut; d = addDays(d, 1)) {
    if (start && d < start) continue;
    if (end && d >= end) break;
    const k = monthKey(d);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Tage eines Monats "2026-02" → 28 */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ─── Seitenweise Listen ───────────────────────────────────────────────────────

export function paging(args: { limit?: number; cursor?: string }) {
  const take = args.limit ?? DEFAULT_LIMIT;
  const skip = decodeCursor(args.cursor);
  return { take, skip };
}

/** Schneidet das (+1 geladene) Ergebnis zu und erzeugt den nächsten Cursor. */
export function page<T>(rows: T[], take: number, skip: number) {
  const more = rows.length > take;
  return {
    eintraege: more ? rows.slice(0, take) : rows,
    naechster_cursor: more ? encodeCursor(skip + take) : null,
  };
}
