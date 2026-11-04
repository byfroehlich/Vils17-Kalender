import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendGuestMessage, GuestMessageError } from "./guest-messages";
import { isGuestCountUnconfirmed } from "./guest-count";
import { addDays, todayVienna, TZ } from "./mcp/format";

// ─── Schlafzimmer-Frage bei 2 Gästen ──────────────────────────────────────────
// Entscheidung Mathias 31.10.2026: In Wohnungen mit Apartment.askSeparateBedrooms (Penthouse) bekommt
// jede künftige Buchung mit genau 2 bestätigten Gästen EINMAL eine feste Nachricht über Smoobu:
// ein Schlafzimmer oder getrennt? Die Antwort läuft in die Sonderwunsch-Erkennung (note-suggestions.ts).
// Nicht zwischen 21 und 7 Uhr (Wien). Texte wörtlich wie von Mathias freigegeben — nicht ändern.
// Nachrichtentext nie ins Audit-Log.

export const BEDROOM_QUESTION_TEXT = {
  de: "Hallo [Vorname], schön, dass ihr ins Penthouse No. 17 kommt! Kurze Frage, damit alles vorbereitet ist: Möchtet ihr zu zweit in einem Schlafzimmer schlafen oder lieber getrennt in beiden Schlafzimmern? Eine kurze Antwort genügt. Liebe Grüße, Mathias",
  en: "Hello [first name], great to have you at Penthouse No. 17! A quick question so everything is ready: will you share one bedroom, or would you prefer separate bedrooms? A short reply is enough. Best regards, Mathias",
} as const;

export const BEDROOM_QUESTION_FROM_HOUR = 7;
export const BEDROOM_QUESTION_UNTIL_HOUR = 21;

/** Sprache des Gastes aus dem Portal-Hinweis („Sprache des Gastes: en“). Ohne Angabe Deutsch. */
export function guestLanguage(channelNotice: string | null | undefined): "de" | "en" {
  const m = /Sprache des Gastes:\s*([a-z]{2,3})/i.exec(channelNotice ?? "");
  if (!m) return "de";
  return m[1]!.toLowerCase() === "de" ? "de" : "en";
}

/** Vorname = erstes Wort des Gastnamens */
export function firstName(guestName: string): string {
  return guestName.trim().split(/\s+/)[0] ?? "";
}

export function bedroomQuestionText(guestName: string, lang: "de" | "en"): string {
  const name = firstName(guestName);
  return lang === "de"
    ? BEDROOM_QUESTION_TEXT.de.replace("[Vorname]", name)
    : BEDROOM_QUESTION_TEXT.en.replace("[first name]", name);
}

function viennaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
}

export interface BedroomQuestionResult {
  skippedNight: boolean;
  sent: number;
  failed: number;
}

/**
 * Schickt die Schlafzimmer-Frage an alle fälligen Buchungen (idempotent, einmal je Buchung über
 * Booking.bedroomQuestionSentAt). Läuft nach jedem Sync (runAutoSync / App-Takt).
 */
export async function runBedroomQuestions(organizationId: string, now = new Date()): Promise<BedroomQuestionResult> {
  const result: BedroomQuestionResult = { skippedNight: false, sent: 0, failed: 0 };
  const hour = viennaHour(now);
  if (hour < BEDROOM_QUESTION_FROM_HOUR || hour >= BEDROOM_QUESTION_UNTIL_HOUR) return { ...result, skippedNight: true };

  const tomorrow = addDays(todayVienna(now), 1);
  const candidates = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      bedroomQuestionSentAt: null,
      guestCount: 2,
      checkIn: { gte: tomorrow },
      apartment: { askSeparateBedrooms: true },
    },
    orderBy: { checkIn: "asc" },
    select: { id: true, smoobuId: true, guestName: true, guestCount: true, guestCountUnknown: true, guestCountManual: true, channelNotice: true },
  });

  for (const b of candidates) {
    // Nur bestätigte Gästezahl — ein Notwert (Booking.com ohne Angabe) zählt nicht
    if (isGuestCountUnconfirmed(b) || !b.smoobuId) continue;

    // Erst reservieren, dann senden — so geht die Frage auch bei parallelen Läufen nur einmal raus
    const claimed = await prisma.booking.updateMany({ where: { id: b.id, organizationId, bedroomQuestionSentAt: null }, data: { bedroomQuestionSentAt: now } });
    if (!claimed.count) continue;

    const lang = guestLanguage(b.channelNotice);
    const text = bedroomQuestionText(b.guestName, lang);
    try {
      await sendGuestMessage(b.smoobuId, text);
      result.sent++;
      await logAudit({
        organizationId,
        action: "guest.message.sent",
        entityType: "Booking",
        entityId: b.id,
        details: { zweck: "schlafzimmer_frage", sprache: lang, zeichen: text.length, via: "automatisch" },
      });
    } catch (e) {
      result.failed++;
      // Smoobu hat eindeutig abgelehnt → nicht gesendet, beim nächsten Lauf erneut versuchen.
      // Unklarer Fehler (Netz) → vermerkt lassen, damit der Gast die Frage nicht doppelt bekommt.
      if (e instanceof GuestMessageError && e.status) {
        await prisma.booking.update({ where: { id: b.id }, data: { bedroomQuestionSentAt: null } });
      }
      console.error("[schlafzimmer] Senden fehlgeschlagen:", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
