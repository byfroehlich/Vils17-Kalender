import type { ParsedPortalMail } from "./parse";

export interface MatchCandidate {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  channelName: string | null;
}

export interface MatchResult {
  booking: MatchCandidate | null;
  /** mehrere gleich gute Treffer → nichts automatisch ändern */
  ambiguous: boolean;
  score: number;
  reason: string;
}

/** Umlaute und Akzente vereinheitlichen, damit "Müller" und "Mueller" passen. */
export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

/**
 * Bewertet, wie gut eine Buchung zur Mail passt.
 * Namensgleichheit und Anreisedatum sind die tragenden Signale; ohne eines von
 * beiden gilt der Treffer als zu schwach.
 */
export function scoreBooking(mail: ParsedPortalMail, booking: MatchCandidate): number {
  let score = 0;

  if (mail.guestName) {
    const mailTokens = new Set(normalizeName(mail.guestName));
    const bookingTokens = normalizeName(booking.guestName);
    const overlap = bookingTokens.filter((t) => mailTokens.has(t)).length;
    if (overlap >= 2) score += 5;
    else if (overlap === 1) score += 2;
  }

  if (mail.checkIn && sameDay(mail.checkIn, booking.checkIn)) score += 4;
  if (mail.checkOut && sameDay(mail.checkOut, booking.checkOut)) score += 2;

  // Portal muss zum Kanal passen, sonst ist es eher eine andere Buchung
  if (booking.channelName && mail.portal) {
    const channel = booking.channelName.toLowerCase();
    const portalHit = mail.portal === "airbnb" ? channel.includes("airbnb") : channel.includes("booking");
    if (portalHit) score += 1;
    else score -= 2;
  }

  return score;
}

/** Mindestpunktzahl, ab der eine Zuordnung als belastbar gilt. */
export const MIN_SCORE = 6;

export function findBooking(mail: ParsedPortalMail, candidates: MatchCandidate[]): MatchResult {
  if (candidates.length === 0) {
    return { booking: null, ambiguous: false, score: 0, reason: "Keine Buchungen zum Vergleich" };
  }

  const scored = candidates
    .map((b) => ({ booking: b, score: scoreBooking(mail, b) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];

  if (best.score < MIN_SCORE) {
    return {
      booking: null,
      ambiguous: false,
      score: best.score,
      reason: mail.guestName || mail.checkIn
        ? "Keine Buchung passt sicher genug (Name und Anreisedatum stimmen nicht überein)"
        : "Mail enthält weder Gastname noch Anreisedatum",
    };
  }

  if (runnerUp && runnerUp.score === best.score) {
    return {
      booking: null,
      ambiguous: true,
      score: best.score,
      reason: "Mehrere Buchungen passen gleich gut — bitte von Hand prüfen",
    };
  }

  return { booking: best.booking, ambiguous: false, score: best.score, reason: "Eindeutig zugeordnet" };
}
