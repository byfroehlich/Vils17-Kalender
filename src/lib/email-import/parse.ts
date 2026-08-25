// ─── Portal-Mails auswerten ───────────────────────────────────────────────────
// Booking.com und Airbnb schicken in ihren Bestätigungsmails Angaben, die Smoobu
// nicht durchreicht — vor allem die Aufteilung Erwachsene/Kinder und Haustiere.
// Alle Funktionen hier sind rein (Text rein, Daten raus) und damit testbar.

export type Portal = "booking.com" | "airbnb";

export interface ParsedPortalMail {
  portal: Portal;
  /** Buchungsnummer (Booking.com) bzw. Reservierungscode (Airbnb) */
  reference: string | null;
  guestName: string | null;
  adults: number | null;
  children: number | null;
  /** Summe, sofern mindestens eine der beiden Angaben gefunden wurde */
  guestCount: number | null;
  pets: number | null;
  checkIn: Date | null;
  checkOut: Date | null;
  /** Sonderwünsche im Klartext (Kinderbett, Zusatzbett …) */
  remarks: string[];
}

const MONTHS_DE: Record<string, number> = {
  jan: 0, feb: 1, "mär": 2, mar: 2, apr: 3, mai: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};
const MONTHS_EN: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Wandelt HTML-Mails in reinen Text — Tags raus, Entities auflösen. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstNumber(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/** Sucht ein Datum in der Nähe einer Beschriftung ("Anreise", "Check-in", …). */
function findLabelledDate(text: string, labels: string[]): Date | null {
  for (const label of labels) {
    const idx = text.toLowerCase().indexOf(label.toLowerCase());
    if (idx === -1) continue;
    // Fenster hinter der Beschriftung — lang genug für "Samstag, 15. August 2026"
    const window = text.slice(idx, idx + 120);
    const d = parseAnyDate(window);
    if (d) return d;
  }
  return null;
}

/** Erkennt ISO-, deutsche und englische Datumsformate. */
export function parseAnyDate(text: string): Date | null {
  // ISO: 2026-08-15
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // Deutsch: "15. August 2026", "15. Aug. 2026", "15.08.2026"
  const deLong = text.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]{3,9})\.?\s*(\d{4})/);
  if (deLong) {
    const key = deLong[2].slice(0, 3).toLowerCase();
    const month = MONTHS_DE[key];
    if (month !== undefined) {
      const d = new Date(Date.UTC(+deLong[3], month, +deLong[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  const deNum = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (deNum) {
    const d = new Date(Date.UTC(+deNum[3], +deNum[2] - 1, +deNum[1]));
    if (!isNaN(d.getTime())) return d;
  }

  // Englisch: "August 15, 2026", "Aug 15 2026", "15 August 2026"
  const enMD = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (enMD) {
    const month = MONTHS_EN[enMD[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Date.UTC(+enMD[3], month, +enMD[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  const enDM = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (enDM) {
    const month = MONTHS_EN[enDM[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Date.UTC(+enDM[3], month, +enDM[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function parsePets(text: string): number | null {
  const n = firstNumber(text, [
    /(\d+)\s*(?:Haustiere?|Hunde?|Katzen?)\b/i,
    /(\d+)\s*(?:pets?|dogs?|cats?)\b/i,
  ]);
  if (n !== null) return n;
  // "Haustiere: ja" / "Pets: yes" → mindestens eines
  if (/Haustiere?\s*[:\-]?\s*(ja|erlaubt|mitgebracht)/i.test(text)) return 1;
  if (/pets?\s*[:\-]?\s*yes/i.test(text)) return 1;
  return null;
}

function parseRemarks(text: string): string[] {
  const remarks: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(extra bed|zusatzbett)\b/i, "Zusatzbett angefordert"],
    [/\b(crib|cot|kinderbett|babybett)\b/i, "Kinderbett angefordert"],
    [/\b(late check[- ]?in|späte anreise)\b/i, "Späte Anreise"],
    [/\b(early check[- ]?in|frühe anreise)\b/i, "Frühe Anreise"],
    [/\b(high chair|hochstuhl)\b/i, "Hochstuhl angefordert"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(text) && !remarks.includes(label)) remarks.push(label);
  }
  return remarks;
}

/**
 * Sucht einen Namen hinter einer Beschriftung. Wichtig: [^\S\r\n] statt \s —
 * sonst zieht der Treffer über den Zeilenumbruch hinweg die nächste Zeile mit
 * hinein ("Tim Spengler Anreise").
 */
function matchName(text: string, labels: string[]): string | null {
  const NAME = "[A-Za-zÄÖÜäöüß'\\-]+(?:[^\\S\\r\\n]+[A-Za-zÄÖÜäöüß'\\-]+){0,3}";
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\S\\r\\n]*[:\\s][^\\S\\r\\n]*(${NAME})`, "i");
    const m = text.match(re);
    if (m) {
      const cleaned = cleanName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function cleanName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return null;
  // Offensichtliche Nicht-Namen aussortieren
  if (/^(gast|guest|name|buchung|booking|reservierung)$/i.test(name)) return null;
  return name;
}

// ─── Booking.com ──────────────────────────────────────────────────────────────

export function parseBookingCom(text: string): ParsedPortalMail {
  const adults = firstNumber(text, [
    /(\d+)\s*Erwachsene[rn]?\b/i,
    /(\d+)\s*adults?\b/i,
  ]);
  const children = firstNumber(text, [
    /(\d+)\s*Kinder\b/i,
    /(\d+)\s*Kind\b/i,
    /(\d+)\s*child(?:ren)?\b/i,
  ]);

  // Fallback: reine Gästezahl ohne Aufteilung
  const totalOnly = adults === null && children === null
    ? firstNumber(text, [/(\d+)\s*(?:Gäste|Gast)\b/i, /(\d+)\s*guests?\b/i])
    : null;

  const refRaw = text.match(/(?:Buchungsnummer|Buchungs-?ID|Booking number|Booking ID|Reservierungsnummer)\s*[:\s]\s*([\d][\d\s.-]{6,22})/i);

  const nameMatch =
    matchName(text, ["Gastname", "Name des Gastes", "Guest name", "Gast", "Guest"]) ??
    matchName(text, ["Nachricht von", "Message from"]);

  return {
    portal: "booking.com",
    reference: refRaw ? refRaw[1].replace(/[\s.-]/g, "") : null,
    guestName: nameMatch,
    adults,
    children,
    guestCount:
      adults !== null || children !== null
        ? (adults ?? 0) + (children ?? 0)
        : totalOnly,
    pets: parsePets(text),
    checkIn: findLabelledDate(text, ["Anreise", "Check-in", "Check in", "Checkin", "Ankunft"]),
    checkOut: findLabelledDate(text, ["Abreise", "Check-out", "Check out", "Checkout"]),
    remarks: parseRemarks(text),
  };
}

// ─── Airbnb ───────────────────────────────────────────────────────────────────

export function parseAirbnb(text: string): ParsedPortalMail {
  const adults = firstNumber(text, [
    /(\d+)\s*Erwachsene[rn]?\b/i,
    /(\d+)\s*adults?\b/i,
  ]);
  const children = firstNumber(text, [
    /(\d+)\s*Kinder\b/i,
    /(\d+)\s*Kind\b/i,
    /(\d+)\s*child(?:ren)?\b/i,
  ]);
  const infants = firstNumber(text, [/(\d+)\s*(?:Kleinkind(?:er)?|Babys?|infants?)\b/i]);

  const totalOnly = adults === null && children === null
    ? firstNumber(text, [/(\d+)\s*(?:Gäste|Gast)\b/i, /(\d+)\s*guests?\b/i])
    : null;

  const refRaw = text.match(/(?:Reservierungscode|Bestätigungscode|Confirmation code|Reservation code)\s*[:\s]\s*([A-Z0-9]{6,12})/i);

  const nameMatch = matchName(text, ["Reservierung von", "Reservation from", "Gastname", "Guest name", "Gast", "Guest"]);

  const known = adults !== null || children !== null || infants !== null;

  return {
    portal: "airbnb",
    reference: refRaw ? refRaw[1].toUpperCase() : null,
    guestName: nameMatch,
    adults,
    children: children !== null || infants !== null ? (children ?? 0) + (infants ?? 0) : null,
    guestCount: known ? (adults ?? 0) + (children ?? 0) + (infants ?? 0) : totalOnly,
    pets: parsePets(text),
    checkIn: findLabelledDate(text, ["Anreise", "Check-in", "Check in", "Ankunft"]),
    checkOut: findLabelledDate(text, ["Abreise", "Check-out", "Check out"]),
    remarks: parseRemarks(text),
  };
}

// ─── Einstieg ─────────────────────────────────────────────────────────────────

export function detectPortal(from: string, subject: string, text: string): Portal | null {
  const haystack = `${from} ${subject}`.toLowerCase();
  if (haystack.includes("booking.com")) return "booking.com";
  if (haystack.includes("airbnb")) return "airbnb";
  // Weitergeleitete Mails: Absender ist der eigene, Portal steht im Text
  const body = text.toLowerCase();
  if (body.includes("booking.com")) return "booking.com";
  if (body.includes("airbnb")) return "airbnb";
  return null;
}

export function parsePortalMail(input: {
  from: string;
  subject: string;
  text: string;
}): ParsedPortalMail | null {
  const portal = detectPortal(input.from, input.subject, input.text);
  if (!portal) return null;
  const text = input.text;
  return portal === "airbnb" ? parseAirbnb(text) : parseBookingCom(text);
}
