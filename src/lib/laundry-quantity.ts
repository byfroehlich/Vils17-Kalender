// Wäschemengen pro Reinigung — EINE Rechnung für Anzeige, Bestellung und
// MCP-Schnittstelle. Reine Funktion, auch in Client-Komponenten nutzbar.

export interface LaundryQuantity {
  beds: number;
  towels: number;
  kitchen: number;
}

export interface LaundryConfig {
  laundryBedsDivisor?: number | null;
  laundryTowelsPerGuest?: number | null;
  laundryKitchenCount?: number | null;
}

/**
 * Mengen nach der Wäsche-Konfiguration der Wohnung:
 * 1 Bettset je `laundryBedsDivisor` Gäste (aufgerundet), Handtücher je Gast,
 * feste Anzahl Küchenhandtücher pro Buchung.
 */
export function calculateLaundryQuantity(guestCount: number, apt: LaundryConfig = {}): LaundryQuantity {
  const divisor = Math.max(1, apt.laundryBedsDivisor ?? 2);
  return {
    beds: Math.ceil(guestCount / divisor),
    towels: guestCount * (apt.laundryTowelsPerGuest ?? 1),
    kitchen: apt.laundryKitchenCount ?? 1,
  };
}
