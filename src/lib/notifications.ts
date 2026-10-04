import { prisma } from "./prisma";
import { sendPushToRole, sendPushToUsers } from "./push";

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

// ─── Warnungen: offene Reinigung, nicht bestellte Wäsche ─────────────────────

/**
 * Verschickt Warnungen — gebündelt, eine Nachricht pro Art statt einer pro
 * Buchung. Jede Buchung löst jede Warnung höchstens einmal aus.
 *
 *  - Reinigungskräfte: Reinigung in den nächsten 10 Tagen noch frei
 *  - Admin/Verwaltung: Reinigung in den nächsten 7 Tagen ohne Reinigungskraft
 *  - Admin/Verwaltung: Wäsche für Reinigung in den nächsten 3 Tagen nicht bestellt
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

  // Admin: Wäsche nicht bestellt, Reinigung in den nächsten 3 Tagen
  const laundry = await prisma.cleaningAssignment.findMany({
    where: {
      organizationId,
      laundryStatus: "OPEN",
      laundryReminderSentAt: null,
      status: { not: "COMPLETED" },
      booking: { status: "confirmed", checkIn: { gte: dayStart(today), lt: dayStart(today, 4) } },
    },
    include: { booking: { select: { id: true, checkIn: true, apartment: { select: { name: true } } } } },
    orderBy: { booking: { checkIn: "asc" } },
  });
  if (laundry.length > 0) {
    const list = laundry.slice(0, 4).map((a) => `${shortApt(a.booking.apartment.name)} ${shortDate(a.booking.checkIn)}`).join(", ");
    await sendPushToRole(organizationId, ["ADMIN", "MANAGER"], {
      title: laundry.length === 1 ? "🧺 Wäsche noch nicht bestellt" : `🧺 Wäsche für ${laundry.length} Reinigungen nicht bestellt`,
      body: `${list}${laundry.length > 4 ? " …" : ""}`,
      url: laundry.length === 1 ? `/bookings/${laundry[0].booking.id}` : "/cleaners",
    });
    await prisma.cleaningAssignment.updateMany({
      where: { id: { in: laundry.map((a) => a.id) } },
      data: { laundryReminderSentAt: new Date() },
    });
    result.laundryReminders = laundry.length;
  }

  return result;
}

// ─── Tagesstatus am Morgen ───────────────────────────────────────────────────

const STATUS_FROM_HOUR = 7;
const STATUS_UNTIL_HOUR = 12; // später kein "Heute"-Push mehr — wäre irreführend

/**
 * Verschickt den Tagesstatus einmal pro Tag, frühestens um 7 Uhr (Wien).
 *  - Admin/Verwaltung: alle heutigen Reinigungen mit Zuständigkeit + offene Wäsche
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
  const laundryOpen = jobs.filter((a) => a.laundryStatus === "OPEN" && a.status !== "COMPLETED");
  if (laundryOpen.length > 0) {
    lines.push(`🧺 Wäsche offen: ${laundryOpen.map((a) => shortApt(a.booking.apartment.name)).join(", ")}`);
  }

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
