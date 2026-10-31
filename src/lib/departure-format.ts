// Reine Anzeige-Helfer für Abreisen der Vorgäste — auch in Client-Komponenten nutzbar (siehe departures.ts).

/** Abreise ohne personenbezogene Daten */
export interface DepartureMarker {
  /** Kalendertag JJJJ-MM-TT */
  day: string;
  apartmentId: string;
  apartmentName: string;
  apartmentColor: string | null;
}

export interface PreviousDeparture {
  /** Kalendertag der Abreise der Vorgäste, JJJJ-MM-TT */
  day: string;
  /** Tage zwischen Abreise der Vorgäste und Anreise (0 = gleicher Tag) */
  daysBefore: number;
}

const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Mo 02.11." für einen Kalendertag JJJJ-MM-TT */
export function shortDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${isoDay.slice(8, 10)}.${isoDay.slice(5, 7)}.`;
}

/** „Mo 02.11. (gleicher Tag)“ / „(Vortag frei)“ / „(3 Tage vorher frei)“ */
export function previousDepartureText(p: PreviousDeparture): string {
  const rel = p.daysBefore <= 0 ? "gleicher Tag" : p.daysBefore === 1 ? "Vortag frei" : `${p.daysBefore} Tage vorher frei`;
  return `${shortDayLabel(p.day)} (${rel})`;
}

