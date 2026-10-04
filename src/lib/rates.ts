// ─── Reinigungssätze ──────────────────────────────────────────────────────────
// Eine einzige Stelle, die entscheidet, was ein Auftrag kostet. Alle Ansichten
// (Abrechnung, Reiniger-Dashboard) und das Festschreiben beim Erledigen nutzen sie.
//
// Regeln:
//  1. Ist der Satz am Auftrag festgeschrieben (beim Erledigen), gilt er — immer.
//  2. Sonst: Trägt die Buchung einen Sondersatz-Vermerk UND reinigt genau die
//     Person, für die er vereinbart ist → Sondersatz (z.B. 70 € für Vanessa).
//  3. Sonst der normale Satz der Reinigungskraft (Vertretungen bekommen also
//     ihren eigenen Satz, nicht den Sondersatz).

export interface RateInput {
  rate?: number | null;
  cleanerId: string | null;
  cleaner?: { cleanerRate: number } | null;
  booking: {
    premiumRate?: number | null;
    premiumRateCleanerId?: string | null;
  };
}

const FALLBACK_RATE = 50;

/** Gilt der Sondersatz der Buchung für diese Reinigungskraft? */
export function isPremiumFor(
  booking: RateInput["booking"],
  cleanerId: string | null | undefined
): boolean {
  return (
    booking.premiumRate != null &&
    !!booking.premiumRateCleanerId &&
    booking.premiumRateCleanerId === cleanerId
  );
}

/** Satz, der für diesen Auftrag gilt bzw. gelten wird. */
export function effectiveRate(a: RateInput): number {
  if (a.rate != null) return a.rate;
  if (isPremiumFor(a.booking, a.cleanerId)) return a.booking.premiumRate as number;
  return a.cleaner?.cleanerRate ?? FALLBACK_RATE;
}

/**
 * Sondersatz-Vermerk für eine neu eingehende Buchung — von der Wohnung
 * übernommen, wenn dort ein Sondersatz vereinbart und der Stichtag erreicht ist.
 */
export function premiumForNewBooking(
  apartment: {
    cleaningRate?: number | null;
    cleaningRateFrom?: Date | null;
    cleaningRateCleanerId?: string | null;
  } | null | undefined,
  now = new Date()
): { premiumRate: number; premiumRateCleanerId: string } | Record<string, never> {
  if (
    apartment?.cleaningRate != null &&
    apartment.cleaningRateCleanerId &&
    apartment.cleaningRateFrom &&
    now >= apartment.cleaningRateFrom
  ) {
    return { premiumRate: apartment.cleaningRate, premiumRateCleanerId: apartment.cleaningRateCleanerId };
  }
  return {};
}
