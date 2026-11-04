// Wäschemengen pro Anreise — EINE Rechnung für Anzeige, Bestellung und
// MCP-Schnittstelle. Reine Funktion, auch in Client-Komponenten nutzbar.
//
// Regel (Mathias, 30.10.2026) — pro Anreise:
//   je Anreise: 1 Badvorleger, Küchentücher (Wohnungs-Einstellung, Vorgabe 1)
//   je Gast:    1 Waschlappen, 1 kleines Handtuch, 1 großes Handtuch, 1 Kissenbezug, 1 Bettbezug
//   Spannbettlaken: je belegtem Bett eines in der passenden Größe (90er, 180er, 200er).
//     Die Betten einer Wohnung stehen in Apartment.laundryBeds in Belegungsreihenfolge,
//     z.B. Penthouse [{200,2},{180,2},{90,1}]: 1–2 Gäste → 200er, 3–4 → + 180er, 5 → + 90er.
//     Ohne Bettenliste: 1 × 180er je N Gäste (laundryBedsDivisor, Vorgabe 2).
// Puffer kommt erst auf die Bestellmenge (siehe laundry-order.ts), nicht auf die einzelne Anreise.

export interface LaundryQuantity {
  /** Spannbettlaken 180 × 200 (auch Vorgabe ohne Bettenliste) */
  beds: number;
  /** Spannbettlaken 90 × 200 (Einzelbett, Schlafcouch bis 100 cm) */
  sheets90: number;
  /** Spannbettlaken 200–220 × 200 */
  sheets200: number;
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

/** Ein Bett einer Wohnung: Breite des Spannbettlakens und Schlafplätze */
export interface LaundryBed {
  width: 90 | 180 | 200;
  persons: number;
}

export interface LaundryConfig {
  laundryBedsDivisor?: number | null;
  laundryTowelsPerGuest?: number | null;
  laundryKitchenCount?: number | null;
  /** Betten in Belegungsreihenfolge (JSON aus der DB); null = Vorgabe über laundryBedsDivisor */
  laundryBeds?: unknown;
}

export const LAUNDRY_ITEMS: { key: keyof LaundryQuantity; label: string; emoji: string }[] = [
  { key: "sheets200", label: "Spannbettlaken 200", emoji: "🛏" },
  { key: "beds", label: "Spannbettlaken 180", emoji: "🛏" },
  { key: "sheets90", label: "Spannbettlaken 90", emoji: "🛏" },
  { key: "duvetCovers", label: "Bettbezüge", emoji: "🛌" },
  { key: "pillowCases", label: "Kissenbezüge", emoji: "💤" },
  { key: "towels", label: "große Handtücher", emoji: "🛁" },
  { key: "handTowels", label: "kleine Handtücher", emoji: "🧻" },
  { key: "washcloths", label: "Waschlappen", emoji: "🧽" },
  { key: "bathMats", label: "Badvorleger", emoji: "🟫" },
  { key: "kitchen", label: "Küchentücher", emoji: "🍽" },
];

export function emptyLaundryQuantity(): LaundryQuantity {
  return { beds: 0, sheets90: 0, sheets200: 0, towels: 0, kitchen: 0, handTowels: 0, pillowCases: 0, duvetCovers: 0, bathMats: 0, washcloths: 0 };
}

/** Alle Spannbettlaken zusammen (für kompakte Anzeigen) */
export function fittedSheetsTotal(q: LaundryQuantity): number {
  return q.beds + q.sheets90 + q.sheets200;
}

/** Bettenliste aus der DB prüfen; ungültig oder leer → null */
export function parseLaundryBeds(raw: unknown): LaundryBed[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const beds: LaundryBed[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") return null;
    const width = (b as Record<string, unknown>).width;
    const persons = (b as Record<string, unknown>).persons;
    if ((width !== 90 && width !== 180 && width !== 200) || typeof persons !== "number" || !Number.isInteger(persons) || persons < 1 || persons > 4) return null;
    beds.push({ width, persons });
  }
  return beds;
}

const SHEET_KEY: Record<LaundryBed["width"], "sheets90" | "beds" | "sheets200"> = { 90: "sheets90", 180: "beds", 200: "sheets200" };

export function calculateLaundryQuantity(guestCount: number, apt: LaundryConfig = {}): LaundryQuantity {
  const guests = Math.max(0, guestCount);
  const perGuest = Math.max(0, apt.laundryTowelsPerGuest ?? 1);
  const q: LaundryQuantity = {
    ...emptyLaundryQuantity(),
    towels: guests * perGuest,
    handTowels: guests * perGuest,
    pillowCases: guests,
    duvetCovers: guests,
    kitchen: apt.laundryKitchenCount ?? 1,
    bathMats: 1,
    washcloths: guests,
  };

  const beds = parseLaundryBeds(apt.laundryBeds);
  if (!beds) {
    q.beds = Math.ceil(guests / Math.max(1, apt.laundryBedsDivisor ?? 2));
    return q;
  }
  // Betten der Reihe nach belegen; mehr Gäste als Plätze → weitere 180er (Zustellbett o.ä.)
  let left = guests;
  for (const b of beds) {
    if (left <= 0) break;
    q[SHEET_KEY[b.width]] += 1;
    left -= b.persons;
  }
  if (left > 0) q.beds += Math.ceil(left / 2);
  return q;
}

/** "3 Spannbettlaken 180, 6 große Handtücher, …" — nur Posten > 0 */
export function laundryText(q: LaundryQuantity): string {
  return LAUNDRY_ITEMS.filter((i) => q[i.key] > 0)
    .map((i) => `${q[i.key]} ${i.label}`)
    .join(", ");
}
