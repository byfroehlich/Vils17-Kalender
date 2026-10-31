import { prisma } from "./prisma";
import { sendPushToRole, sendPushToUsers } from "./push";
import { loadLaundryPlan } from "./laundry-proposal";
import { laundryAlert, LAUNDRY_ALERT_DAYS, LAUNDRY_ALERT_SHORT_NOTICE_DAYS } from "./laundry-order";
import { laundryText, LAUNDRY_ITEMS } from "./laundry-quantity";

// ─── Zeit in Vils (Europe/Vienna) ─────────────────────────────────────────────
// Buchungsdaten liegen als UTC-Mitternacht des Kalendertags in der DB
// ("2026-10-12" → 2026-10-12T00:00:00Z). Verglichen wird deshalb über den
// Kalendertag in Wien, nicht über Uhrzeiten.

const TZ = "Europe/Vienna";

/** "2026-10-04" — heutiger Kalendertag in Wien */
export function viennaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function viennaHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
}

/** UTC-Mitternacht des Kalendertags + n Tage — passend zum Speicherformat */
function dayStart(key: string, plusDays = 0): Date {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("de-AT", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

/** Wohnungsnamen kürzen: "Penthouse No. 17 - Vils" → "Penthouse" */
function shortApt(name: string): string {
  return name.split(/\s+No\.|\s+-\s+/)[0].trim() || name;
}

// ─── Warnungen: offene Reinigung, Wäsche-Bestand ─────────────────────────────

/**
 * Verschickt Warnungen — gebündelt, eine Nachricht pro Art statt einer pro
 * Buchung. Jede Buchung löst jede Warnung höchstens einmal aus.
 *
 *  - Reinigungskräfte: Reinigung in den nächsten 10 Tagen noch frei
 *  - Admin/Verwaltung: Reinigung in den nächsten 7 Tagen ohne Reinigungskraft
 *  - Admin/Verwaltung: Wäsche-Bestand reicht für die nächsten 14 Tage nicht (einmal je Lage,
 *    siehe maybeSendLaundryAlert). Wäsche wird nicht mehr pro Buchung gewarnt
 *    (Entscheidung Mathias 31.10.2026).
 */
export async function runReminders(organizationId: string) {
  const today = viennaDateKey();
  const result = { cleanerReminders: 0, adminReminders: 0, laundryReminders: 0 };

  const openBase = {
    organizationId,
    status: "UNASSIGNED" as const,
    isSelfClean: false,
    booking: { status: "confirmed" },
  };

  // Reinigungskräfte: noch frei in den nächsten 10 Tagen
  const free = await prisma.cleaningAssignment.findMany({
    where: {
      ...openBase,
      cleanerReminderSentAt: null,
      booking: { status: "confirmed", checkIn: { gte: dayStart(today), lt: dayStart(today, 11) } },
    },
    include: { booking: { select: { checkIn: true, apartment: { select: { name: true } } } } },
    orderBy: { booking: { checkIn: "asc" } },
  });
  if (free.length > 0) {
    const list = free.slice(0, 4).map((a) => `${shortApt(a.booking.apartment.name)} ${shortDate(a.booking.checkIn)}`).join(", ");
    await sendPushToRole(organizationId, ["CLEANER"], {
      title: free.length === 1 ? "Reinigung noch frei" : `${free.length} Reinigungen noch frei`,
      body: `${list}${free.length > 4 ? " …" : ""} — jetzt zusagen?`,
      url: "/my-jobs/list",
    });
    await prisma.cleaningAssignment.updateMany({
      where: { id: { in: free.map((a) => a.id) } },
      data: { cleanerReminderSentAt: new Date() },
    });
    result.cleanerReminders = free.length;
  }

  // Admin: ohne Reinigungskraft in den nächsten 7 Tagen
  const urgent = await prisma.cleaningAssignment.findMany({
    where: {
      ...openBase,
      adminReminderSentAt: null,
      booking: { status: "confirmed", checkIn: { gte: dayStart(today), lt: dayStart(today, 8) } },
    },
    include: { booking: { select: { id: true, checkIn: true, apartment: { select: { name: true } } } } },
    orderBy: { booking: { checkIn: "asc" } },
  });
  if (urgent.length > 0) {
    const list = urgent.slice(0, 4).map((a) => `${shortApt(a.booking.apartment.name)} ${shortDate(a.booking.checkIn)}`).join(", ");
    await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
      title: urgent.length === 1 ? "⚠️ Reinigung ohne Reinigungskraft" : `⚠️ ${urgent.length} Reinigungen ohne Reinigungskraft`,
      body: `${list}${urgent.length > 4 ? " …" : ""}`,
      url: urgent.length === 1 ? `/bookings/${urgent[0].booking.id}` : "/cleaners",
    });
    await prisma.cleaningAssignment.updateMany({
      where: { id: { in: urgent.map((a) => a.id) } },
      data: { adminReminderSentAt: new Date() },
    });
    result.adminReminders = urgent.length;
  }

  // Admin: Wäsche-Bestand im Keller reicht nicht (eine Meldung je neuer Lage, nicht pro Buchung)
  if (await maybeSendLaundryAlert(organizationId)) result.laundryReminders = 1;

  return result;
}

// ─── Wäsche-Bestand: „reicht nicht – bestellen“ ───────────────────────────────

const LAUNDRY_ALERT_FROM_HOUR = 7;
const LAUNDRY_ALERT_UNTIL_HOUR = 21; // nachts keine Wäsche-Pushes — die Meldung kommt dann ab 7 Uhr

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** "Fr 07.11." */
function weekdayDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]} ${dd}.${mm}.`;
}

/**
 * Einziges Wäsche-Signal (Entscheidung Mathias 31.10.2026): Reicht der Bestand im Keller
 * (inkl. Reserve und bestellter, noch nicht angekommener Lieferungen) für die Anreisen der
 * nächsten 14 Tage nicht, oder geht ein Teil vor einer Lieferung aus, bekommt
 * Admin/Verwaltung eine Push-Nachricht.
 *
 * In der Saison kommen laufend (kurzfristige) Buchungen und Stornos. Deshalb keine Sperre
 * „1× pro Tag“, sondern ein Fingerabdruck der LAGE (Organization.laundryAlertKey):
 * erster Engpasstag + betroffene Teile + Bestellmenge + Engpässe vor Lieferung.
 *  - gleiche Lage → keine neue Meldung (der App-Takt ruft das alle 5 Min auf)
 *  - neue Buchung / Storno / andere Gästezahl ändert die Lage → neue Meldung
 *  - reicht es wieder → Fingerabdruck gelöscht, ein späterer Engpass meldet sich erneut
 * Ohne erfassten Bestand keine Meldung — dann lässt sich „reicht nicht“ nicht sagen.
 */
export async function maybeSendLaundryAlert(organizationId: string, now = new Date()): Promise<boolean> {
  const todayKey = viennaDateKey(now);
  const today = dayStart(todayKey);
  const r = await loadLaundryPlan({ organizationId, today, days: LAUNDRY_ALERT_DAYS });
  const plan = r.plan;
  const alert = laundryAlert(plan);

  if (!alert.orderNeeded) {
    // Lage entspannt (z.B. Storno, Lieferung) → beim nächsten Engpass wieder melden
    await prisma.organization.updateMany({ where: { id: organizationId, laundryAlertKey: { not: null } }, data: { laundryAlertKey: null } });
    return false;
  }

  const hour = viennaHour(now);
  if (hour < LAUNDRY_ALERT_FROM_HOUR || hour >= LAUNDRY_ALERT_UNTIL_HOUR) return false;

  const first = plan.firstShortage;
  const key = [
    first ? dayKey(first.day) : "-",
    (first?.items ?? []).slice().sort().join(","),
    LAUNDRY_ITEMS.map((i) => plan.order[i.key]).join(","),
    alert.shortItems.slice().sort().join(","),
  ].join("|");

  // Atomar: nur senden, wenn sich die Lage gegenüber der letzten Meldung geändert hat
  const claimed = await prisma.organization.updateMany({
    where: { id: organizationId, OR: [{ laundryAlertKey: null }, { laundryAlertKey: { not: key } }] },
    data: { laundryAlertKey: key },
  });
  if (claimed.count === 0) return false;

  const label = (k: string) => LAUNDRY_ITEMS.find((i) => i.key === k)?.label ?? k;
  const inDays = first ? Math.round((first.day.getTime() - today.getTime()) / 86_400_000) : null;
  const kurzfristig = inDays !== null && inDays <= LAUNDRY_ALERT_SHORT_NOTICE_DAYS;

  let title = "🧺 Wäsche reicht nicht";
  if (first) {
    const who = first.arrivals
      .map((a) => `${shortApt(a.apartmentName)}, ${a.guestCount} ${a.guestCount === 1 ? "Gast" : "Gäste"}${a.guestCountAssumed ? " angenommen" : ""}`)
      .join("; ");
    title += ` ab ${weekdayDate(first.day)} (${who})`;
  } else {
    title += ` bis ${shortDate(dayStart(todayKey, LAUNDRY_ALERT_DAYS - 1))}`;
  }
  if (kurzfristig) title = `⚠️ Kurzfristig: ${title.replace(/^🧺 /, "")}`;

  const parts: string[] = [];
  if (alert.orderItems.length) parts.push(`fehlt: ${laundryText(plan.order)}`);
  if (alert.shortItems.length) parts.push(`vor der nächsten Lieferung knapp: ${alert.shortItems.map(label).join(", ")}`);
  parts.push("Jetzt bestellen");

  await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
    title,
    body: parts.join(" – "),
    url: "/laundry",
  });
  return true;
}

/** "2026-11-07" aus UTC-Mitternacht */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Tagesstatus am Morgen ───────────────────────────────────────────────────

const STATUS_FROM_HOUR = 7;
const STATUS_UNTIL_HOUR = 12; // später kein "Heute"-Push mehr — wäre irreführend

/**
 * Verschickt den Tagesstatus einmal pro Tag, frühestens um 7 Uhr (Wien).
 *  - Admin/Verwaltung: alle heutigen Reinigungen mit Zuständigkeit (Wäsche läuft über den
 *    Bestand, siehe maybeSendLaundryAlert — keine Wäsche-Zeile pro Buchung)
 *  - Jede Reinigungskraft: nur ihre eigenen heutigen Reinigungen
 * Ohne Reinigung heute wird nichts verschickt (kein tägliches Rauschen).
 */
export async function maybeSendDailyStatus(organizationId: string): Promise<boolean> {
  const hour = viennaHour();
  if (hour < STATUS_FROM_HOUR || hour >= STATUS_UNTIL_HOUR) return false;

  const today = viennaDateKey();

  // Atomar "reservieren" — verhindert Doppelversand, wenn Cron und App gleichzeitig kommen
  const claimed = await prisma.organization.updateMany({
    where: {
      id: organizationId,
      OR: [{ dailyStatusSentOn: null }, { dailyStatusSentOn: { not: today } }],
    },
    data: { dailyStatusSentOn: today },
  });
  if (claimed.count === 0) return false;

  const jobs = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId,
      booking: { status: "confirmed", checkIn: { gte: dayStart(today), lt: dayStart(today, 1) } },
    },
    include: {
      cleaner: { select: { id: true, name: true } },
      booking: { select: { id: true, guestCount: true, arrivalTime: true, apartment: { select: { name: true } } } },
    },
    orderBy: { booking: { apartment: { name: "asc" } } },
  });

  if (jobs.length === 0) return true;

  // Admin/Verwaltung: Gesamtüberblick
  const lines = jobs.map((a) => {
    const apt = shortApt(a.booking.apartment.name);
    const who =
      a.status === "COMPLETED" ? "erledigt ✓"
      : a.isSelfClean || a.status === "SELF_CLEAN" ? "Selbstreinigung"
      : a.cleaner && a.status === "ASSIGNED" ? a.cleaner.name
      : "⚠️ noch offen";
    return `${apt}: ${who}`;
  });

  await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
    title: jobs.length === 1 ? "Heute: 1 Reinigung" : `Heute: ${jobs.length} Reinigungen`,
    body: lines.join(" · "),
    url: "/cleaners",
  });

  // Reinigungskräfte: nur die eigenen
  const byCleaner = new Map<string, typeof jobs>();
  for (const a of jobs) {
    if (!a.cleaner || a.status !== "ASSIGNED") continue;
    const list = byCleaner.get(a.cleaner.id) ?? [];
    list.push(a);
    byCleaner.set(a.cleaner.id, list);
  }
  for (const [cleanerId, own] of Array.from(byCleaner.entries())) {
    const body = own
      .map((a) => {
        const parts = [shortApt(a.booking.apartment.name)];
        if (a.booking.arrivalTime) parts.push(`Anreise ab ${a.booking.arrivalTime}`);
        parts.push(`${a.booking.guestCount} ${a.booking.guestCount === 1 ? "Gast" : "Gäste"}`);
        return parts.join(", ");
      })
      .join(" · ");
    await sendPushToUsers([cleanerId], {
      title: own.length === 1 ? "Heute: deine Reinigung" : `Heute: ${own.length} Reinigungen`,
      body,
      url: "/my-jobs",
    });
  }

  return true;
}
