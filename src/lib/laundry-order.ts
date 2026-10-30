import { calculateLaundryQuantity, emptyLaundryQuantity, LAUNDRY_ITEMS, type LaundryConfig, type LaundryQuantity } from "./laundry-quantity";

// ─── Wäsche: Bestand, Reserve, Bestellmenge ───────────────────────────────────
// Auftrag Mathias 30.10.2026:
//  - Alle zwei Wochen die Menge nennen, die bestellt werden muss, damit die Wäsche nicht ausgeht.
//  - Nie „auf den Punkt“: bei JEDEM Teil eine Reserve (fällt runter, ist schmutzig,
//    kommt fleckig von der Wäscherei; zwei Gäste in getrennten Betten).
//  - Es gibt einen Startbestand im Keller, der erfasst wird.
//
// Rechnung:
//   Bestand heute  = letzte Zählung + Lieferungen danach (bis heute) − Anreisen danach (vor heute)
//   Bedarf         = Wäsche aller Anreisen im Zeitraum
//   Bestellmenge   = Bedarf + Reserve − Bestand heute − bereits bestellte Lieferungen im Zeitraum (nie < 0)
// Eine Zählung gilt am Ende ihres Tages (Anreisen am Zähltag sind schon versorgt).
// Reine Funktionen — testbar.

/** Vorgabe-Reserve je Teil (Vorschlag; in der App änderbar). */
export const DEFAULT_RESERVE: LaundryQuantity = {
  beds: 2,
  sheets90: 1,
  sheets200: 1,
  duvetCovers: 2,
  pillowCases: 2,
  towels: 3,
  handTowels: 3,
  washcloths: 2,
  bathMats: 2,
  kitchen: 2,
};

export interface Arrival {
  apartmentId: string;
  apartmentName: string;
  guestName: string;
  checkIn: Date;
  guestCount: number;
  apartment: LaundryConfig;
}

export interface StockCount {
  countedOn: Date;
  quantities: LaundryQuantity;
}

export interface Delivery {
  deliveryOn: Date;
  quantities: LaundryQuantity;
}

export interface LaundryPlan {
  arrivals: number;
  guests: number;
  /** Bedarf der Anreisen im Zeitraum */
  need: LaundryQuantity;
  reserve: LaundryQuantity;
  /** null = noch kein Bestand erfasst */
  stockToday: LaundryQuantity | null;
  /** schon bestellt, Lieferung im Zeitraum */
  incoming: LaundryQuantity;
  /** zu bestellen */
  order: LaundryQuantity;
  /** Bestand am Ende des Zeitraums, wenn wie vorgeschlagen bestellt wird */
  stockAfter: LaundryQuantity | null;
  /** Teile, die schon VOR einer Lieferung im Zeitraum knapp werden (Bestand < 0 an einem Tag) */
  shortBeforeDelivery: (keyof LaundryQuantity)[];
  perApartment: { apartmentName: string; arrivals: number; guests: number; need: LaundryQuantity }[];
}

const KEYS = LAUNDRY_ITEMS.map((i) => i.key);

export function normalizeQuantity(raw: unknown): LaundryQuantity {
  const out = emptyLaundryQuantity();
  if (raw && typeof raw === "object") {
    for (const k of KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      out[k] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    }
  }
  return out;
}

function combine(a: LaundryQuantity, b: LaundryQuantity, sign = 1): LaundryQuantity {
  const out = emptyLaundryQuantity();
  for (const k of KEYS) out[k] = a[k] + sign * b[k];
  return out;
}

function usage(arrivals: Arrival[]): LaundryQuantity {
  return arrivals.reduce((sum, a) => combine(sum, calculateLaundryQuantity(a.guestCount, a.apartment)), emptyLaundryQuantity());
}

const t = (d: Date) => d.getTime();

/**
 * @param arrivals alle bestätigten Anreisen ab dem Tag nach der Zählung (bzw. ab heute ohne Zählung) bis Zeitraum-Ende
 * @param today    Kalendertag heute (UTC-Mitternacht)
 * @param end      erster Tag NACH dem Zeitraum
 */
export function planLaundry(params: {
  arrivals: Arrival[];
  count: StockCount | null;
  deliveries: Delivery[];
  today: Date;
  end: Date;
  reserve?: LaundryQuantity | null;
}): LaundryPlan {
  const { count, today, end } = params;
  const reserve = params.reserve ?? DEFAULT_RESERVE;
  const after = (d: Date) => !count || t(d) > t(count.countedOn);

  const window = params.arrivals.filter((a) => t(a.checkIn) >= t(today) && t(a.checkIn) < t(end));
  const need = usage(window);

  let stockToday: LaundryQuantity | null = null;
  if (count) {
    const usedBefore = usage(params.arrivals.filter((a) => after(a.checkIn) && t(a.checkIn) < t(today)));
    const delivered = params.deliveries
      .filter((d) => after(d.deliveryOn) && t(d.deliveryOn) <= t(today))
      .reduce((s, d) => combine(s, d.quantities), emptyLaundryQuantity());
    stockToday = combine(combine(count.quantities, delivered), usedBefore, -1);
  }

  const incomingList = params.deliveries.filter((d) => t(d.deliveryOn) > t(today) && t(d.deliveryOn) < t(end) && after(d.deliveryOn));
  const incoming = incomingList.reduce((s, d) => combine(s, d.quantities), emptyLaundryQuantity());

  const order = emptyLaundryQuantity();
  for (const k of KEYS) {
    order[k] = Math.max(0, need[k] + reserve[k] - (stockToday?.[k] ?? 0) - incoming[k]);
  }

  // Knapp vor einer Lieferung: Tag für Tag durchgehen (nur mit Bestand sinnvoll)
  const short = new Set<keyof LaundryQuantity>();
  if (stockToday && incomingList.length) {
    let running = { ...stockToday };
    const days = new Set<number>([...window.map((a) => t(a.checkIn)), ...incomingList.map((d) => t(d.deliveryOn))]);
    for (const day of Array.from(days).sort((a, b) => a - b)) {
      for (const d of incomingList.filter((x) => t(x.deliveryOn) === day)) running = combine(running, d.quantities);
      running = combine(running, usage(window.filter((a) => t(a.checkIn) === day)), -1);
      for (const k of KEYS) if (running[k] < 0) short.add(k);
    }
  }

  const byApt = new Map<string, { apartmentName: string; arrivals: number; guests: number; need: LaundryQuantity }>();
  for (const a of window) {
    const cur = byApt.get(a.apartmentId) ?? { apartmentName: a.apartmentName, arrivals: 0, guests: 0, need: emptyLaundryQuantity() };
    cur.arrivals++;
    cur.guests += a.guestCount;
    cur.need = combine(cur.need, calculateLaundryQuantity(a.guestCount, a.apartment));
    byApt.set(a.apartmentId, cur);
  }

  return {
    arrivals: window.length,
    guests: window.reduce((s, a) => s + a.guestCount, 0),
    need,
    reserve,
    stockToday,
    incoming,
    order,
    stockAfter: stockToday ? combine(combine(combine(stockToday, incoming), order), need, -1) : null,
    shortBeforeDelivery: Array.from(short),
    perApartment: Array.from(byApt.values()),
  };
}
