import { prisma } from "./prisma";
import { todayVienna } from "./mcp/format";

// ─── Belegung des laufenden Monats (neue Admin-Übersicht, Entscheidung Mathias 01.11.2026) ───
// Je Wohnung ein Feld pro Nacht: belegt, wenn eine bestätigte Buchung die Nacht umfasst
// (Anreisetag belegt, Abreisetag frei). Buchungsdaten liegen als UTC-Mitternacht vor.

export interface StayRange { checkIn: Date; checkOut: Date }

/** Nächte ab monthStart (UTC-Mitternacht), Länge `days`: true = belegt */
export function occupiedNights(stays: StayRange[], monthStart: Date, days: number): boolean[] {
  const nights = Array.from({ length: days }, () => false);
  const start = monthStart.getTime();
  for (const s of stays) {
    for (let t = s.checkIn.getTime(); t < s.checkOut.getTime(); t += 86_400_000) {
      const i = Math.round((t - start) / 86_400_000);
      if (i >= 0 && i < days) nights[i] = true;
    }
  }
  return nights;
}

export interface OccupancyApartment { id: string; name: string; color: string | null; nights: boolean[]; booked: number }
export interface Occupancy { monthLabel: string; days: number; todayIndex: number; apartments: OccupancyApartment[] }

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const shortName = (name: string) => name.split(/\s+No\.|\s+-\s+/)[0]?.trim() || name;

export async function loadOccupancy(organizationId: string, now = new Date()): Promise<Occupancy> {
  const today = todayVienna(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const days = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86_400_000);

  const apartments = await prisma.apartment.findMany({
    where: { organizationId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, color: true,
      bookings: {
        where: { status: "confirmed", checkIn: { lt: nextMonth }, checkOut: { gt: monthStart } },
        select: { checkIn: true, checkOut: true },
      },
    },
  });

  return {
    monthLabel: MONTHS[monthStart.getUTCMonth()] ?? "",
    days,
    todayIndex: Math.round((today.getTime() - monthStart.getTime()) / 86_400_000),
    apartments: apartments.map((a) => {
      const nights = occupiedNights(a.bookings, monthStart, days);
      return { id: a.id, name: shortName(a.name), color: a.color, nights, booked: nights.filter(Boolean).length };
    }),
  };
}
