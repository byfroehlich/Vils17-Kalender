import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendGuestMessage, GuestMessageError } from "./guest-messages";
import { scanBookingForDogs } from "./pet-actions";
import { guestLanguage, firstName } from "./bedroom-question";
import { addDays, todayVienna, TZ } from "./mcp/format";

// ─── Hundebetreuung: Nachricht nur an Gäste mit Hund ─────────────────────────
// Entscheidung Mathias 11.11.2026: Gäste, bei denen ein Hund eingetragen oder erkannt ist, bekommen
// 14 Tage vor Anreise EINMAL einen Hinweis auf Fröhliche Pfoten (Hundebetreuung). Smoobu kann nicht
// nach Hund filtern, deshalb schickt die App. Dazu prüft die App regelmäßig Portalnotiz und Gästechat
// der kommenden Buchungen auf Hunde (Booking.com überträgt keine Haustiere).
// Texte wörtlich wie freigegeben (Winter freigegeben 11.11.2026; Sommer = freigegebene Variante 09.11.)
// – nicht ändern ohne neue Freigabe. Nachrichtentext nie ins Audit-Log.

export const DOG_CARE_DAYS_BEFORE = 14;
export const DOG_CARE_FROM_HOUR = 9;
export const DOG_CARE_UNTIL_HOUR = 21;
/** Hundeprüfung der kommenden Buchungen höchstens alle 2 Stunden, Buchungen bis 60 Tage voraus */
export const DOG_SCAN_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const DOG_SCAN_DAYS_AHEAD = 60;
export const DOG_SCAN_MAX_PER_RUN = 25;

/** Englische Fassung und Kurzfrist-Fassung erst nach Freigabe durch Mathias senden */
export const DOG_CARE_EN_FREIGEGEBEN = false;
export const DOG_CARE_KURZFRISTIG_FREIGEGEBEN = false;

const WINTER_BEISPIEL =
  "Auf die Skipiste, in die Therme oder über den Weihnachtsmarkt kann dein Vierbeiner nicht immer mit, und beim gemütlichen Abendessen ist er manchmal entspannter in guten Händen.";
const SOMMER_BEISPIEL =
  "Schloss Neuschwanstein, eine Bergtour mit Seilbahn oder ein Tag in der Therme sind nicht immer etwas für Vierbeiner, und beim gemütlichen Abendessen ist er manchmal entspannter in guten Händen.";

export function isSummer(d: Date): boolean {
  const m = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "numeric" }).format(d));
  return m >= 4 && m <= 10;
}

/** Freigegebener deutscher Text (Winter/Sommer nach dem Anreisemonat) */
export function dogCareTextDe(guestName: string, checkIn: Date): string {
  const sommer = isSummer(checkIn);
  return [
    `Hallo ${firstName(guestName)},`,
    "",
    "in zwei Wochen geht's los, wir freuen uns schon auf dich und deinen Hund!",
    "",
    `Ein kleiner Tipp für deine ${sommer ? "Urlaubsplanung" : "Winterplanung"}: ${sommer ? SOMMER_BEISPIEL : WINTER_BEISPIEL} Für solche Stunden gibt es Fröhliche Pfoten. Kati kümmert sich liebevoll um deinen Hund und geht mit ihm raus in die ${sommer ? "Natur" : "winterliche Natur"} rund um Füssen, stundenweise oder den ganzen Tag. Sie holt ihn direkt bei uns an der Wohnung ab und bringt ihn wieder zurück. Abends oder über Nacht bleibt sie auf Wunsch auch bei ihm in der Wohnung.`,
    "",
    "Alle Infos, Preise und die Anfrage: www.froehliche-pfoten-allgaeu.de",
    "",
    "Frag am besten schon jetzt an, dann ist dein Wunschtag sicher eingeplant.",
    "",
    "Liebe Grüße",
    "Mathias",
  ].join("\n");
}

function viennaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
}

export interface DogCareResult {
  scanned: number;
  dogsFound: number;
  sent: number;
  failed: number;
  skippedNight: boolean;
  waitingApproval: number;
}

/** Prüft kommende Buchungen ohne Hund regelmäßig auf Hunde (Portalnotiz + Gästechat). Gedrosselt. */
export async function scanUpcomingForDogs(organizationId: string, now = new Date()): Promise<{ scanned: number; found: number }> {
  const claimed = await prisma.organization.updateMany({
    where: { id: organizationId, OR: [{ petScanAt: null }, { petScanAt: { lt: new Date(now.getTime() - DOG_SCAN_INTERVAL_MS) } }] },
    data: { petScanAt: now },
  });
  if (!claimed.count) return { scanned: 0, found: 0 };
  const today = todayVienna(now);
  const list = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      checkIn: { gte: today, lte: addDays(today, DOG_SCAN_DAYS_AHEAD) },
      OR: [{ petSource: null }, { petSource: { not: "manual" } }],
      AND: [{ OR: [{ petCount: null }, { petCount: 0 }] }],
    },
    orderBy: { checkIn: "asc" },
    take: DOG_SCAN_MAX_PER_RUN,
    select: { id: true },
  });
  let found = 0;
  for (const b of list) {
    try {
      const r = await scanBookingForDogs({ organizationId, bookingId: b.id, actor: { via: "automatisch" } });
      if (r.changed) found++;
    } catch (e) {
      console.error("[hunde] Prüfung fehlgeschlagen:", e instanceof Error ? e.message : e);
    }
  }
  return { scanned: list.length, found };
}

/** Schickt den Hinweis auf Fröhliche Pfoten an fällige Buchungen mit Hund (einmal je Buchung). */
export async function runDogCareMessages(organizationId: string, now = new Date()): Promise<DogCareResult> {
  const scan = await scanUpcomingForDogs(organizationId, now);
  const result: DogCareResult = { scanned: scan.scanned, dogsFound: scan.found, sent: 0, failed: 0, skippedNight: false, waitingApproval: 0 };
  const hour = viennaHour(now);
  if (hour < DOG_CARE_FROM_HOUR || hour >= DOG_CARE_UNTIL_HOUR) return { ...result, skippedNight: true };

  const today = todayVienna(now);
  const candidates = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      dogCareMessageSentAt: null,
      petCount: { gt: 0 },
      checkIn: { gt: today, lte: addDays(today, DOG_CARE_DAYS_BEFORE) },
    },
    orderBy: { checkIn: "asc" },
    select: { id: true, smoobuId: true, guestName: true, checkIn: true, channelNotice: true },
  });

  for (const b of candidates) {
    if (!b.smoobuId) continue;
    const lang = guestLanguage(b.channelNotice);
    const daysAhead = Math.round((b.checkIn.getTime() - today.getTime()) / 86400000);
    // „in zwei Wochen“ stimmt nur ab 12 Tagen vorher; kurzfristige und englische Fassung warten auf Freigabe
    if (lang === "en" && !DOG_CARE_EN_FREIGEGEBEN) { result.waitingApproval++; continue; }
    if (daysAhead < 12 && !DOG_CARE_KURZFRISTIG_FREIGEGEBEN) { result.waitingApproval++; continue; }

    const claimed = await prisma.booking.updateMany({ where: { id: b.id, organizationId, dogCareMessageSentAt: null }, data: { dogCareMessageSentAt: now } });
    if (!claimed.count) continue;
    const text = dogCareTextDe(b.guestName, b.checkIn);
    try {
      await sendGuestMessage(b.smoobuId, text);
      result.sent++;
      await logAudit({
        organizationId,
        action: "guest.message.sent",
        entityType: "Booking",
        entityId: b.id,
        details: { zweck: "hundebetreuung", sprache: lang, zeichen: text.length, via: "automatisch" },
      });
    } catch (e) {
      result.failed++;
      if (e instanceof GuestMessageError && e.status) {
        await prisma.booking.update({ where: { id: b.id }, data: { dogCareMessageSentAt: null } });
      }
      console.error("[hundebetreuung] Senden fehlgeschlagen:", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
