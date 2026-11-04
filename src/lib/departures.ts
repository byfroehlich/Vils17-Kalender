import { prisma } from "./prisma";
import { addDays, day, todayVienna } from "./mcp/format";

// ─── Abreisen der Vorgäste für Reinigungskräfte ───────────────────────────────
// Entscheidung Mathias 31.10.2026: Reinigungskräfte sehen nur ihre eigenen Aufträge (die Anreise,
// die sie vorbereiten) — nicht, wann die Gäste davor abreisen. Damit sie planen können (gleicher
// Tag oder schon am Vortag), bekommen ALLE Reinigungskräfte die Abreisen BEIDER Wohnungen —
// ohne Gastnamen — und an jedem Auftrag „Vorgäste reisen ab: <Tag> (gleicher Tag / Vortag frei)“.
// Buchungsdaten sind UTC-Mitternacht des Kalendertags.

import type { DepartureMarker, PreviousDeparture } from "./departure-format";
export * from "./departure-format";

type B = { apartmentId: string; checkIn: Date; checkOut: Date };

/**
 * Letzte Abreise in derselben Wohnung am oder vor dem Anreisetag. Liegt sie mehr als
 * `maxGapDays` zurück, gilt die Wohnung als leer (null).
 */
export function findPreviousDeparture(bookings: B[], apartmentId: string, checkIn: Date, maxGapDays = 30): PreviousDeparture | null {
  let best: Date | null = null;
  for (const b of bookings) {
    if (b.apartmentId !== apartmentId) continue;
    if (b.checkOut.getTime() > checkIn.getTime() || b.checkIn.getTime() >= checkIn.getTime()) continue;
    if (!best || b.checkOut.getTime() > best.getTime()) best = b.checkOut;
  }
  if (!best) return null;
  const daysBefore = Math.round((checkIn.getTime() - best.getTime()) / 86_400_000);
  if (daysBefore > maxGapDays) return null;
  return { day: day(best), daysBefore };
}

/**
 * Lädt die bestätigten Buchungen der Organisation im Zeitraum (für Abreise-Markierungen und
 * Vorgäste-Abreise der Aufträge). Gastnamen werden bewusst nicht geladen.
 */
export async function loadDepartureData(organizationId: string, opts: { from?: Date; days?: number } = {}) {
  const from = opts.from ?? addDays(todayVienna(), -45);
  const to = addDays(from, opts.days ?? 45 + 400);
  const rows = await prisma.booking.findMany({
    where: { organizationId, status: "confirmed", checkOut: { gte: addDays(from, -31), lt: to } },
    orderBy: { checkOut: "asc" },
    select: { apartmentId: true, checkIn: true, checkOut: true, apartment: { select: { name: true, color: true } } },
  });
  const departures: DepartureMarker[] = rows
    .filter((b) => b.checkOut.getTime() >= from.getTime())
    .map((b) => ({ day: day(b.checkOut), apartmentId: b.apartmentId, apartmentName: b.apartment.name, apartmentColor: b.apartment.color }));
  return {
    departures,
    previousDeparture: (apartmentId: string, checkIn: Date) => findPreviousDeparture(rows, apartmentId, checkIn),
  };
}
