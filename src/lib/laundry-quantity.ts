// Wäschemengen pro Anreise — EINE Rechnung für Anzeige, Bestellung und
// MCP-Schnittstelle. Reine Funktion, auch in Client-Komponenten nutzbar.
//
// Regel (Mathias, 30.10.2026) — pro Anreise:
//   je Anreise: 1 Badvorleger, Küchentücher (Wohnungs-Einstellung, Vorgabe 1)
//   je Gast:    1 Waschlappen, 1 kleines Handtuch, 1 großes Handtuch, 1 Kissenbezug, 1 Bettbezug
//   je 2 Gäste: 1 Spannbettlaken (Teiler aus der Wohnungs-Einstellung, Vorgabe 2)
// Puffer kommt erst auf die Bestellmenge (siehe laundry-order.ts), nicht auf die einzelne Anreise.

export interface LaundryQuantity {
  /** Spannbettlaken */
  beds: number;
  /** große Handtücher (Körper) */
  towels: number;
  /** Küchentücher */
  kitchen: number;
  /** kleine Handtücher (Hände) */
  handTowels: number;
  pillowCases: number;
  duvetCovers: number;
  bathMats: number;
  washcloths: number;
}

export interface LaundryConfig {
  laundryBedsDivisor?: number | null;
  laundryTowelsPerGuest?: number | null;
  laundryKitchenCount?: number | null;
}

export const LAUNDRY_ITEMS: { key: keyof LaundryQuantity; label: string; emoji: string }[] = [
  { key: "beds", label: "Spannbettlaken", emoji: "🛏" },
  { key: "duvetCovers", label: "Bettbezüge", emoji: "🛌" },
  { key: "pillowCases", label: "Kissenbezüge", emoji: "💤" },
  { key: "towels", label: "große Handtücher", emoji: "🛁" },
  { key: "handTowels", label: "kleine Handtücher", emoji: "🧻" },
  { key: "washcloths", label: "Waschlappen", emoji: "🧽" },
  { key: "bathMats", label: "Badvorleger", emoji: "🟫" },
  { key: "kitchen", label: "Küchentücher", emoji: "🍽" },
];

export function emptyLaundryQuantity(): LaundryQuantity {
  return { beds: 0, towels: 0, kitchen: 0, handTowels: 0, pillowCases: 0, duvetCovers: 0, bathMats: 0, washcloths: 0 };
}

export function calculateLaundryQuantity(guestCount: number, apt: LaundryConfig = {}): LaundryQuantity {
  const guests = Math.max(0, guestCount);
  const divisor = Math.max(1, apt.laundryBedsDivisor ?? 2);
  const perGuest = Math.max(0, apt.laundryTowelsPerGuest ?? 1);
  return {
    beds: Math.ceil(guests / divisor),
    towels: guests * perGuest,
    handTowels: guests * perGuest,
    pillowCases: guests,
    duvetCovers: guests,
    kitchen: apt.laundryKitchenCount ?? 1,
    bathMats: 1,
    washcloths: guests,
  };
}

/** "3 Spannbettlaken, 6 große Handtücher, …" — nur Posten > 0 */
export function laundryText(q: LaundryQuantity): string {
  return LAUNDRY_ITEMS.filter((i) => q[i.key] > 0)
    .map((i) => `${q[i.key]} ${i.label}`)
    .join(", ");
}
