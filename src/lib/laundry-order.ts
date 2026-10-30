import { calculateLaundryQuantity, emptyLaundryQuantity, LAUNDRY_ITEMS, type LaundryConfig, type LaundryQuantity } from "./laundry-quantity";

// ─── Wäsche-Bestellvorschlag für einen Zeitraum ───────────────────────────────
// Auftrag Mathias 30.10.2026: alle zwei Wochen die Menge nennen, die bestellt
// werden muss, damit die Wäsche nicht ausgeht. Bedarf = Summe der Anreisen im
// Zeitraum (jede Anreise braucht frisch bezogene Betten) plus Puffer.
//
// Puffer:
//  - Spannbettlaken: +1 je Wohnung mit Anreise im Zeitraum — für den Fall, dass zwei
//    Gäste zwei Betten statt eines Doppelbetts nutzen.
//  - alle anderen Posten: +10 %, aufgerundet (bei kleinen Mengen also +1).
// Reine Funktion — testbar.

export const BUFFER_PERCENT = 10;

export interface Arrival {
  apartmentId: string;
  apartmentName: string;
  guestName: string;
  checkIn: Date;
  guestCount: number;
  isSelfClean?: boolean;
  apartment: LaundryConfig;
}

export interface LaundryOrderProposal {
  arrivals: number;
  guests: number;
  /** Bedarf ohne Puffer */
  need: LaundryQuantity;
  buffer: LaundryQuantity;
  /** Bestellmenge = Bedarf + Puffer */
  order: LaundryQuantity;
  perApartment: { apartmentName: string; arrivals: number; guests: number; need: LaundryQuantity }[];
}

function add(a: LaundryQuantity, b: LaundryQuantity): LaundryQuantity {
  const out = emptyLaundryQuantity();
  for (const { key } of LAUNDRY_ITEMS) out[key] = a[key] + b[key];
  return out;
}

export function proposeLaundryOrder(arrivals: Arrival[]): LaundryOrderProposal {
  let need = emptyLaundryQuantity();
  const byApt = new Map<string, { apartmentName: string; arrivals: number; guests: number; need: LaundryQuantity }>();

  for (const a of arrivals) {
    const q = calculateLaundryQuantity(a.guestCount, a.apartment);
    need = add(need, q);
    const cur = byApt.get(a.apartmentId) ?? { apartmentName: a.apartmentName, arrivals: 0, guests: 0, need: emptyLaundryQuantity() };
    cur.arrivals++;
    cur.guests += a.guestCount;
    cur.need = add(cur.need, q);
    byApt.set(a.apartmentId, cur);
  }

  const buffer = emptyLaundryQuantity();
  for (const { key } of LAUNDRY_ITEMS) {
    buffer[key] = key === "beds" ? byApt.size : need[key] > 0 ? Math.ceil((need[key] * BUFFER_PERCENT) / 100) : 0;
  }

  return {
    arrivals: arrivals.length,
    guests: arrivals.reduce((s, a) => s + a.guestCount, 0),
    need,
    buffer,
    order: add(need, buffer),
    perApartment: Array.from(byApt.values()),
  };
}
