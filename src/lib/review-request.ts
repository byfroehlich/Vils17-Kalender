import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendGuestMessage, GuestMessageError } from "./guest-messages";
import { firstName, guestLanguage } from "./bedroom-question";
import { addDays, channelGroup, todayVienna, TZ } from "./mcp/format";
import { isMailboxConfigured, listFolders, listMessages, type MailSummary } from "./mailbox";

// ─── Bewertungsanfrage nach der Abreise ───────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Gäste, die schon bewertet haben, bekommen keine Bewertungsanfrage mehr.
// Bisher schickte Smoobu-Vorlage 6 die Anfrage an Abreise + 2 Tage 8:00 an alle. Jetzt schickt die App
// sie selbst — einmal je Buchung über Booking.reviewRequestSentAt.
// - Airbnb: vorher im Postfach (info@vils17.at) nach einer Bewertungsmail von automated@airbnb.com suchen;
//   Treffer → keine Anfrage (reviewRequestSkippedAt). Postfach nicht erreichbar → in diesem Lauf nichts senden.
// - Booking.com / Direkt: kein Signal verfügbar → Anfrage wird gesendet.
// - Erst aktiv mit REVIEW_REQUEST_ENABLED=true (Smoobu-Vorlage 6 muss dann abgeschaltet sein,
//   sonst bekommen Gäste zwei Nachrichten).
// Texte wörtlich wie von Mathias freigegeben — nicht ändern. Nachrichtentext und Namen nie ins Audit-Log.

export const REVIEW_REQUEST_TEXT = {
  de:
    "Hallo [Vorname],\n\nschön, dass du bei uns warst – wir hoffen, es hat dir gefallen! ✨\n" +
    "Wir würden uns sehr über eine kurze Bewertung auf [channel] freuen.\n\n" +
    "Auch dein persönliches Feedback ist uns wichtig – so können wir den Aufenthalt für dich und unsere zukünftigen Gäste kontinuierlich verbessern.\n\n" +
    "Vielen Dank & liebe Grüße\nMathias",
  en: "Hello [first name],\n\nwe were happy to host you and hope you enjoyed your stay!\nWe would really appreciate a short review.\n\nBest regards\nMathias",
} as const;

/** Frühestens ab 8:00 Uhr Wien, nicht ab 21 Uhr */
export const REVIEW_REQUEST_FROM_HOUR = 8;
export const REVIEW_REQUEST_UNTIL_HOUR = 21;
/** Regulär: Abreise vor 2 Tagen. Verpasste Fälle werden bis Abreise vor 7 Tagen nachgeholt. */
export const REVIEW_REQUEST_DAYS_AFTER = 2;
export const REVIEW_REQUEST_MAX_DAYS_AFTER = 7;

export const AIRBNB_REVIEW_SENDER = "automated@airbnb.com";

/**
 * Optional REVIEW_REQUEST_FROM=JJJJ-MM-TT: nur Buchungen, deren regulärer Termin (Abreise + 2 Tage) an oder nach
 * diesem Tag liegt. Gedacht für den Umstieg: Gäste, die Smoobu-Vorlage 6 vor dem Abschalten schon angeschrieben hat,
 * werden beim Nachholen (bis 7 Tage) nicht ein zweites Mal gefragt. Ungültig/leer → keine Grenze.
 */
export function reviewRequestFrom(): Date | null {
  const v = (process.env.REVIEW_REQUEST_FROM ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function isReviewRequestEnabled(): boolean {
  return (process.env.REVIEW_REQUEST_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function reviewRequestText(guestName: string, lang: "de" | "en", channel: "Airbnb" | "Booking.com" | "Direkt"): string {
  const name = firstName(guestName);
  if (lang === "en") return REVIEW_REQUEST_TEXT.en.replace("[first name]", name);
  const de = REVIEW_REQUEST_TEXT.de.replace("[Vorname]", name);
  // Direktbuchung: einzige freigegebene Anpassung — der Satz ohne Kanal
  return channel === "Direkt" ? de.replace(" auf [channel] freuen.", " freuen.") : de.replace("[channel]", channel);
}

// Betreffzeilen, mit denen Airbnb eine abgegebene Bewertung meldet (DE + EN, tolerant).
// „<Vorname> wartet auf deine Bewertung“ / „waiting for your review“ ist KEIN Signal.
const REVIEW_SUBJECT_PATTERNS: RegExp[] = [
  /\bhat\s+(?:dir\s+)?eine\s+[\d,.]*\s*[-‐‑–]?\s*sterne[-‐‑–]?\s*bewertung\s+(?:hinterlassen|geschrieben|abgegeben)/i,
  /\bhat\s+dir\s+eine\s+bewertung\s+(?:geschrieben|hinterlassen)/i,
  /\bhat\s+eine\s+bewertung\s+(?:hinterlassen|geschrieben|abgegeben)/i,
  /\bleft\s+(?:you\s+)?an?\s+(?:[\w.,-]+\s+){0,3}review\b/i,
  /\bwrote\s+(?:you\s+)?an?\s+(?:[\w.,-]+\s+){0,3}review\b/i,
];
const NOT_A_REVIEW = [/wartet\s+auf\s+deine\s+bewertung/i, /waiting\s+for\s+your\s+review/i];

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("de");

/** Ist dieser Betreff eine Airbnb-Meldung „<Vorname> hat eine Bewertung hinterlassen“ für diesen Gast? */
export function isAirbnbReviewSubject(subject: string, guestFirstName: string): boolean {
  const name = norm(guestFirstName.trim());
  if (!name) return false;
  const s = norm(subject);
  if (!s.includes(name)) return false;
  if (NOT_A_REVIEW.some((p) => p.test(s))) return false;
  return REVIEW_SUBJECT_PATTERNS.some((p) => p.test(s));
}

/** Hat der Gast laut Postfach seit der Anreise schon bewertet? */
export function hasAirbnbReview(mails: MailSummary[], guestName: string, checkIn: Date): boolean {
  const name = firstName(guestName);
  return mails.some(
    (m) =>
      m.from.some((a) => a.address.toLowerCase() === AIRBNB_REVIEW_SENDER) &&
      (!m.date || new Date(m.date).getTime() >= checkIn.getTime()) &&
      isAirbnbReviewSubject(m.subject, name)
  );
}

/**
 * Airbnb-Mails aus dem Postfach (nur Kopfdaten über Sequenznummern — kein IMAP-SEARCH,
 * nichts wird als gelesen markiert). Durchsucht alle Ordner außer Gesendet/Entwürfe/Spam,
 * weil Bewertungsmails auch archiviert oder gelöscht sein können.
 */
async function loadAirbnbMails(): Promise<MailSummary[]> {
  const folders = await listFolders();
  const out: MailSummary[] = [];
  for (const f of folders) {
    if (f.specialUse && ["\\Sent", "\\Drafts", "\\Junk"].includes(f.specialUse)) continue;
    const pageSize = 100;
    for (let page = 1; ; page++) {
      const r = await listMessages({ folder: f.path, query: AIRBNB_REVIEW_SENDER, page, pageSize });
      out.push(...r.messages);
      if (page * pageSize >= r.total) break;
    }
  }
  return out;
}

function viennaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
}

const BLOCK_CHANNEL = /blocked|blockiert|eigen|owner/i;

export interface ReviewRequestResult {
  disabled: boolean;
  skippedTime: boolean;
  sent: number;
  skippedReviewed: number;
  /** Airbnb-Buchungen, die mangels Postfach in diesem Lauf nicht geprüft werden konnten */
  waitingForMailbox: number;
  failed: number;
}

/**
 * Schickt die Bewertungsanfrage an alle fälligen Buchungen (idempotent, einmal je Buchung).
 * Fällig: bestätigt, Abreise vor 2–7 Tagen (Kalendertag Wien), ab 8:00 bis 21:00 Wien.
 * Läuft nach jedem Sync (runAutoSync / App-Takt).
 */
export async function runReviewRequests(organizationId: string, now = new Date()): Promise<ReviewRequestResult> {
  const result: ReviewRequestResult = { disabled: false, skippedTime: false, sent: 0, skippedReviewed: 0, waitingForMailbox: 0, failed: 0 };
  if (!isReviewRequestEnabled()) return { ...result, disabled: true };
  const hour = viennaHour(now);
  if (hour < REVIEW_REQUEST_FROM_HOUR || hour >= REVIEW_REQUEST_UNTIL_HOUR) return { ...result, skippedTime: true };

  const today = todayVienna(now);
  const from = reviewRequestFrom();
  const earliestCheckOut = addDays(today, -REVIEW_REQUEST_MAX_DAYS_AFTER);
  const fromCheckOut = from ? addDays(from, -REVIEW_REQUEST_DAYS_AFTER) : null;
  const candidates = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      reviewRequestSentAt: null,
      reviewRequestSkippedAt: null,
      checkOut: { gte: fromCheckOut && fromCheckOut > earliestCheckOut ? fromCheckOut : earliestCheckOut, lte: addDays(today, -REVIEW_REQUEST_DAYS_AFTER) },
    },
    orderBy: { checkOut: "asc" },
    select: { id: true, smoobuId: true, guestName: true, channelName: true, channelNotice: true, checkIn: true },
  });
  const due = candidates.filter((b) => b.smoobuId && !BLOCK_CHANNEL.test(b.channelName ?? ""));
  if (!due.length) return result;

  // Postfach nur abfragen, wenn eine Airbnb-Buchung fällig ist — und nur einmal je Lauf
  let airbnbMails: MailSummary[] | null = null;
  if (due.some((b) => channelGroup(b.channelName) === "Airbnb") && isMailboxConfigured()) {
    try {
      airbnbMails = await loadAirbnbMails();
    } catch (e) {
      console.error("[bewertung] Postfach nicht lesbar:", e instanceof Error ? e.message : e);
    }
  }

  for (const b of due) {
    const channel = channelGroup(b.channelName);

    if (channel === "Airbnb") {
      // Ohne Postfach nicht blind senden — beim nächsten Lauf erneut versuchen
      if (!airbnbMails) {
        result.waitingForMailbox++;
        continue;
      }
      if (hasAirbnbReview(airbnbMails, b.guestName, b.checkIn)) {
        const skipped = await prisma.booking.updateMany({
          where: { id: b.id, organizationId, reviewRequestSentAt: null, reviewRequestSkippedAt: null },
          data: { reviewRequestSkippedAt: now, reviewRequestSkipReason: "airbnb_bewertung_vorhanden" },
        });
        if (skipped.count) {
          result.skippedReviewed++;
          await logAudit({
            organizationId,
            action: "guest.review_request.skipped",
            entityType: "Booking",
            entityId: b.id,
            details: { grund: "airbnb_bewertung_vorhanden", kanal: channel },
          });
        }
        continue;
      }
    }

    // Erst reservieren, dann senden — so geht die Anfrage auch bei parallelen Läufen nur einmal raus
    const claimed = await prisma.booking.updateMany({
      where: { id: b.id, organizationId, reviewRequestSentAt: null, reviewRequestSkippedAt: null },
      data: { reviewRequestSentAt: now },
    });
    if (!claimed.count) continue;

    const lang = guestLanguage(b.channelNotice);
    const text = reviewRequestText(b.guestName, lang, channel);
    try {
      await sendGuestMessage(b.smoobuId!, text);
      result.sent++;
      await logAudit({
        organizationId,
        action: "guest.message.sent",
        entityType: "Booking",
        entityId: b.id,
        details: { zweck: "bewertungsanfrage", sprache: lang, kanal: channel, zeichen: text.length, via: "automatisch" },
      });
    } catch (e) {
      result.failed++;
      // Smoobu hat eindeutig abgelehnt → nicht gesendet, beim nächsten Lauf erneut versuchen.
      // Unklarer Fehler (Netz) → vermerkt lassen, damit der Gast die Anfrage nicht doppelt bekommt.
      if (e instanceof GuestMessageError && e.status) {
        await prisma.booking.update({ where: { id: b.id }, data: { reviewRequestSentAt: null } });
      }
      console.error("[bewertung] Senden fehlgeschlagen:", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
