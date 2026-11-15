// Abrechnungsmonat einer Reinigung (Entscheidung Mathias 15.11.2026):
// Eine Reinigung zählt in den Monat, in dem sie als „erledigt“ markiert wurde – nicht mehr in den
// Abreisemonat der Gäste. Grund: Die Abreise der Gäste, für die gereinigt wurde, liegt oft im Folgemonat
// (Reinigung 26.10., Gäste reisen im November ab → landete fälschlich im November).
// Altbestand ohne Zeitpunkt (vor dem 15.11.2026 erledigt, kein Protokolleintrag): Reinigungstag
// = Anreisetag der nächsten Gäste (Booking.checkIn, UTC-Mitternacht des Kalendertags).

type Billable = { completedAt?: Date | string | null; booking: { checkIn: Date | string } };

const viennaParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // JJJJ-MM-TT
};

/** Kalendertag JJJJ-MM-TT, an dem die Reinigung abgerechnet wird */
export function billingDay(a: Billable): string {
  if (a.completedAt) return viennaParts(new Date(a.completedAt));
  return new Date(a.booking.checkIn).toISOString().slice(0, 10);
}

/** Abrechnungsmonat JJJJ-MM */
export function billingMonth(a: Billable): string {
  return billingDay(a).slice(0, 7);
}
