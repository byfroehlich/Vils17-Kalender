// ─── Hunde: Erkennung und Hundegebühr ─────────────────────────────────────────
// Entscheidung Mathias 30.10.2026:
//  - Hundegebühr 15 € pro Hund und Nacht, beide Wohnungen.
//  - Airbnb kassiert die Gebühr selbst (über Smoobu eingestellt) → dort nichts anfordern.
//  - Booking.com berechnet keine Hundegebühr und überträgt Haustiere nicht sauber
//    → Hund aus Portalnotiz bzw. Gästechat erkennen, Gebühr per Nachricht anfordern.
// Reine Funktionen, ohne Datenbank — testbar.

export const PET_FEE_PER_NIGHT = 15;

/** Kanäle, die die Hundegebühr selbst einziehen. */
export function portalCollectsPetFee(channelName: string | null | undefined): boolean {
  return /airbnb/i.test(channelName ?? "");
}

export interface DogDetection {
  /** Anzahl Hunde; mindestens 1, wenn erkannt */
  count: number;
  /** Kurzer Auszug rund um die Fundstelle */
  hint: string;
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, unser: 1, unseren: 1, unsere: 1, mein: 1, meinen: 1, meine: 1,
  a: 1, an: 1, one: 1, our: 1, my: 1,
  zwei: 2, two: 2, beide: 2, both: 2,
  drei: 3, three: 3,
  vier: 4, four: 4,
};

// Hund-Wörter (Singular/Plural, DE + EN). "Hundeurlaub" o.ä. als Teil eines Wortes zählt nicht.
const DOG = "(?:hund|hunde|hunden|hündin|hündchen|welpe|welpen|dog|dogs|puppy|puppies)";
const PET = "(?:haustier|haustiere|haustieren|vierbeiner|pet|pets)";
const ADJ = "(?:(?:kleine[nmrs]?|klein|große[nmrs]?|groß|mittelgroße[nmrs]?|kleiner|small|little|big|large|medium|sized?|-)\\s+)*";

const NEGATION = new RegExp(
  `\\b(?:kein(?:e|en)?|ohne|no|without|not\\s+(?:bring(?:ing)?|travel(?:l?ing)?\\s+with))\\s+${ADJ}(?:${DOG}|${PET})\\b`,
  "i"
);
const COUNTED = new RegExp(`\\b(\\d{1,2}|[a-zäöü]+)\\s+${ADJ}(${DOG}|${PET})\\b`, "gi");
const MENTION = new RegExp(`\\b(?:${DOG}|${PET})\\b`, "i");

/** Fragen nach Hunden ("Sind Hunde erlaubt?") zählen nicht als Hund dabei. */
const QUESTION_ONLY = /\b(?:erlaubt|allowed|gestattet|möglich|darf\s+man|are\s+pets|sind\s+hunde|dürfen\s+hunde)\b[^.!\n]*\?/i;

function snippet(text: string, index: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Erkennt einen Hund in Gästetext (Portalnotiz oder Gästenachricht).
 * Gibt null zurück, wenn kein Hund erwähnt ist oder ausdrücklich keiner kommt.
 * Ohne Zahl im Text gilt 1 Hund.
 */
export function detectDogs(text: string | null | undefined): DogDetection | null {
  if (!text) return null;
  const t = text.normalize("NFC");
  const mention = MENTION.exec(t);
  if (!mention) return null;
  if (NEGATION.test(t)) {
    // "kein Hund" — aber "2 Hunde, keine Katze" o.ä. bleibt Hund; nur wenn nirgends gezählt
    const counted = Array.from(t.matchAll(COUNTED)).filter((m) => countWord(m[1] ?? "") !== null);
    if (!counted.length) return null;
  }
  // Reine Frage ohne Ankündigung → nicht als Hund werten
  if (QUESTION_ONLY.test(t) && !/\b(?:mit\s+dabei|dabei|bringen|mitnehmen|mitbringen|kommt\s+mit|kommen\s+mit|with\s+us|bring(?:ing)?|travel(?:l?ing)?\s+with)\b/i.test(t)) {
    return null;
  }

  let count = 0;
  let firstIndex = mention.index;
  for (const m of Array.from(t.matchAll(COUNTED))) {
    const n = countWord(m[1] ?? "");
    if (n !== null && n > count) {
      count = n;
      firstIndex = m.index ?? firstIndex;
    }
  }
  return { count: Math.max(1, count), hint: snippet(t, firstIndex) };
}

function countWord(w: string): number | null {
  const lower = w.toLowerCase();
  if (/^\d+$/.test(lower)) {
    const n = parseInt(lower, 10);
    return n >= 1 && n <= 9 ? n : null;
  }
  return NUMBER_WORDS[lower] ?? null;
}

/** Nächte zwischen An- und Abreise (Kalendertage, Daten als UTC-Mitternacht). */
export function nights(checkIn: Date, checkOut: Date): number {
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

export type PetFeeState = "KEINE" | "PORTAL" | "OFFEN" | "ANGEFORDERT" | "BEZAHLT" | "ERLASSEN";

export interface PetFee {
  state: PetFeeState;
  /** Betrag, der anzufordern ist bzw. angefordert wurde */
  amount: number;
  dogs: number;
  nights: number;
}

/** Stand der Hundegebühr einer Buchung. */
export function petFee(b: {
  petCount?: number | null;
  channelName?: string | null;
  checkIn: Date;
  checkOut: Date;
  petFeeStatus?: string | null;
  petFeeAmount?: number | null;
}): PetFee {
  const dogs = b.petCount ?? 0;
  const n = nights(b.checkIn, b.checkOut);
  const computed = dogs * n * PET_FEE_PER_NIGHT;
  if (dogs <= 0) return { state: "KEINE", amount: 0, dogs: 0, nights: n };
  if (portalCollectsPetFee(b.channelName)) return { state: "PORTAL", amount: computed, dogs, nights: n };
  const amount = b.petFeeAmount ?? computed;
  switch (b.petFeeStatus) {
    case "REQUESTED": return { state: "ANGEFORDERT", amount, dogs, nights: n };
    case "PAID": return { state: "BEZAHLT", amount, dogs, nights: n };
    case "WAIVED": return { state: "ERLASSEN", amount: 0, dogs, nights: n };
    default: return { state: "OFFEN", amount: computed, dogs, nights: n };
  }
}

export const PET_FEE_LABEL: Record<PetFeeState, string> = {
  KEINE: "kein Hund",
  PORTAL: "kassiert das Portal",
  OFFEN: "noch nicht angefordert",
  ANGEFORDERT: "angefordert",
  BEZAHLT: "bezahlt",
  ERLASSEN: "erlassen",
};

const euro = (n: number) => `${n.toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

/**
 * Vorschlag für die Nachricht an den Gast. Zahlungsweg aus PET_FEE_PAYMENT_TEXT
 * (z.B. PayPal-Link oder Bankverbindung) — ohne diese Variable bleibt ein
 * Platzhalter stehen, den Mathias vor dem Senden ersetzt.
 */
export function petFeeMessage(p: { guestName: string; dogs: number; nights: number; amount: number; paymentText?: string | null }): string {
  const vorname = p.guestName.trim().split(/\s+/)[0] ?? p.guestName;
  const hund = p.dogs === 1 ? "eurem Hund" : `euren ${p.dogs} Hunden`;
  const zahlung = p.paymentText?.trim() || "[ZAHLUNGSWEG EINTRAGEN]";
  // Entscheidung Mathias 31.10.2026: angefordert wird erst, wenn die Gäste vor Ort sind – daher „bis zur Abreise“.
  return [
    `Hallo ${vorname},`,
    "",
    `schön, dass ihr mit ${hund} bei uns seid – wir hoffen, ihr habt eine richtig schöne Zeit in Vils!`,
    `Für Hunde berechnen wir ${euro(PET_FEE_PER_NIGHT)} pro Hund und Nacht. Bei ${p.nights} ${p.nights === 1 ? "Nacht" : "Nächten"} sind das ${euro(p.amount)}. Das ist im Buchungspreis nicht enthalten.`,
    "Magst du den Betrag bitte bis zur Abreise begleichen?",
    zahlung,
    "",
    "Danke dir und liebe Grüße",
    "Mathias",
  ].join("\n");
}
