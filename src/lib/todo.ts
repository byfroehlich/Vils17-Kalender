import { prisma } from "./prisma";
import { addDays, day, todayVienna } from "./mcp/format";
import { UNCONFIRMED_GUEST_COUNT } from "./guest-count";
import { loadLaundryPlan } from "./laundry-proposal";
import { laundryAlert, LAUNDRY_ALERT_DAYS, LAUNDRY_ALERT_SHORT_NOTICE_DAYS } from "./laundry-order";
import { laundryText } from "./laundry-quantity";
import { petFee } from "./pets";
import { findUnansweredChats } from "./guest-chat-overview";
import { shortDayLabel } from "./departure-format";

// ─── „Zu erledigen“ (Dashboard Admin/Verwaltung) ──────────────────────────────
// Entscheidung Mathias 31.10.2026: EINE Karte oben, nach Dringlichkeit sortiert, eine Zeile je Punkt,
// Tipp öffnet den Punkt. Ersetzt die einzelnen Banner (Absagen, ohne Reinigungskraft, Gästezahl,
// Wäsche). Wichtiges rot/bernstein, der Rest neutral. Keine Finanzzahlen (Verwaltung sieht dasselbe).

export type TodoSeverity = "red" | "amber" | "neutral";
export type TodoKind = "absage" | "ohne_reinigung" | "gaestezahl" | "waesche" | "mangel" | "hinweis" | "chat" | "hundegebuehr";

export interface TodoItem {
  key: string;
  kind: TodoKind;
  severity: TodoSeverity;
  /** Bezugstag (Anreise, Engpass …) für die Reihenfolge; null = ohne Termin */
  date: string | null;
  label: string;
  href: string;
  /** Mangel mit Foto */
  photo?: boolean;
}

const RANK: Record<TodoSeverity, number> = { red: 0, amber: 1, neutral: 2 };
const KIND_ORDER: TodoKind[] = ["absage", "ohne_reinigung", "waesche", "gaestezahl", "mangel", "hinweis", "chat", "hundegebuehr"];

/** Dringlichkeit: Farbe → Termin (früher zuerst, ohne Termin zuletzt) → Art */
export function sortTodos(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  });
}

const short = (name: string) => name.split(/\s+No\.|\s+-\s+/)[0]?.trim() || name;
const daysUntil = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/** Wie lange Smoobu für die Chat-Prüfung höchstens bekommt, bevor die Karte ohne sie erscheint */
export const CHAT_CHECK_BUDGET_MS = 6000;

export interface TodoResult {
  items: TodoItem[];
  /** Gästechats konnten nicht (rechtzeitig) geprüft werden */
  chatsUnchecked: boolean;
}

export async function loadTodos(organizationId: string, opts: { now?: Date; withChats?: boolean } = {}): Promise<TodoResult> {
  const now = opts.now ?? new Date();
  const today = todayVienna(now);
  const items: TodoItem[] = [];

  const [declined, unassigned, unknownGuests, issues, suggestions, dogBookings] = await Promise.all([
    prisma.cleaningAssignment.findMany({
      where: { organizationId, cleanerUnavailable: true, booking: { status: "confirmed", checkIn: { gte: today } } },
      orderBy: { booking: { checkIn: "asc" } },
      select: { id: true, cleaner: { select: { name: true } }, booking: { select: { id: true, checkIn: true, apartment: { select: { name: true } } } } },
    }),
    prisma.booking.findMany({
      where: {
        organizationId, status: "confirmed", checkIn: { gte: today, lt: addDays(today, 15) },
        OR: [{ cleaningAssignment: null }, { cleaningAssignment: { status: "UNASSIGNED", isSelfClean: false, cleanerUnavailable: false } }],
      },
      orderBy: { checkIn: "asc" },
      select: { id: true, checkIn: true, apartment: { select: { name: true } } },
    }),
    prisma.booking.findMany({
      where: { organizationId, status: "confirmed", checkOut: { gte: today }, ...UNCONFIRMED_GUEST_COUNT },
      orderBy: { checkIn: "asc" },
      select: { id: true, checkIn: true, channelName: true, apartment: { select: { name: true } } },
    }),
    prisma.issue.findMany({
      where: { organizationId, doneAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, text: true, createdAt: true, photoType: true, apartmentId: true },
    }),
    prisma.noteSuggestion.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, proposedText: true, booking: { select: { checkIn: true, apartment: { select: { name: true } } } } },
    }),
    prisma.booking.findMany({
      where: { organizationId, status: "confirmed", petCount: { gt: 0 }, checkOut: { gte: today } },
      orderBy: { checkIn: "asc" },
      select: { id: true, checkIn: true, checkOut: true, channelName: true, petCount: true, petFeeStatus: true, petFeeAmount: true, apartment: { select: { name: true } } },
    }),
  ]);

  for (const a of declined) {
    items.push({
      key: `absage-${a.id}`, kind: "absage", severity: "red", date: day(a.booking.checkIn),
      label: `Absage: ${short(a.booking.apartment.name)} ${shortDayLabel(day(a.booking.checkIn))}${a.cleaner ? ` (${a.cleaner.name})` : ""} – neue Reinigungskraft nötig`,
      href: `/bookings/${a.booking.id}`,
    });
  }

  for (const b of unassigned) {
    const soon = daysUntil(today, b.checkIn) <= 3;
    items.push({
      key: `ohne-${b.id}`, kind: "ohne_reinigung", severity: soon ? "red" : "amber", date: day(b.checkIn),
      label: `Reinigung ohne Reinigungskraft: ${short(b.apartment.name)} ${shortDayLabel(day(b.checkIn))}`,
      href: `/bookings/${b.id}`,
    });
  }

  for (const b of unknownGuests) {
    const soon = daysUntil(today, b.checkIn) <= 7;
    items.push({
      key: `gaeste-${b.id}`, kind: "gaestezahl", severity: soon ? "red" : "amber", date: day(b.checkIn),
      label: `Gästezahl unbekannt: ${short(b.apartment.name)} ${shortDayLabel(day(b.checkIn))}${b.channelName ? ` (${b.channelName})` : ""}`,
      href: `/bookings/${b.id}`,
    });
  }

  const aptNames = new Map((await prisma.apartment.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((a) => [a.id, short(a.name)]));
  for (const i of issues) {
    const drain = /^abfluss/i.test(i.text);
    const what = i.kind === "SUPPLY" ? "Einkauf" : drain ? "Abfluss" : "Schaden";
    const text = i.text.replace(/^abfluss:\s*/i, "").replace(/\s+/g, " ").trim();
    items.push({
      key: `mangel-${i.id}`, kind: "mangel", severity: i.kind === "SUPPLY" ? "neutral" : "amber", date: null,
      label: `${what} ${aptNames.get(i.apartmentId) ?? ""}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text}`,
      href: "/issues",
      ...(i.photoType ? { photo: true } : {}),
    });
  }

  for (const s of suggestions) {
    items.push({
      key: `hinweis-${s.id}`, kind: "hinweis", severity: "amber", date: day(s.booking.checkIn),
      label: `Hinweis bestätigen: ${short(s.booking.apartment.name)} ${shortDayLabel(day(s.booking.checkIn))} – ${s.proposedText}`,
      href: "/messages#hinweise",
    });
  }

  for (const b of dogBookings) {
    const fee = petFee(b);
    if (fee.state !== "OFFEN" && fee.state !== "ANGEFORDERT") continue;
    items.push({
      key: `hund-${b.id}`, kind: "hundegebuehr", severity: fee.state === "OFFEN" ? "amber" : "neutral", date: day(b.checkIn),
      label: `Hundegebühr ${fee.state === "OFFEN" ? "anfordern" : "angefordert, noch offen"}: ${short(b.apartment.name)} ${shortDayLabel(day(b.checkIn))}`,
      href: `/bookings/${b.id}`,
    });
  }

  // Wäsche nach Bestand (14 Tage)
  const laundry = await loadLaundryPlan({ organizationId, today, days: LAUNDRY_ALERT_DAYS });
  const alert = laundryAlert(laundry.plan);
  if (alert.noStock) {
    items.push({ key: "waesche-bestand", kind: "waesche", severity: "neutral", date: null, label: "Wäsche: Bestand im Keller erfassen", href: "/laundry" });
  } else if (alert.orderNeeded) {
    const first = laundry.plan.firstShortage;
    const urgent = !!first && daysUntil(today, first.day) <= LAUNDRY_ALERT_SHORT_NOTICE_DAYS;
    const order = laundryText(laundry.plan.order);
    items.push({
      key: "waesche-bestellen", kind: "waesche", severity: urgent ? "red" : "amber", date: first ? day(first.day) : null,
      label: `Wäsche bestellen${first ? ` – reicht nicht ab ${shortDayLabel(day(first.day))}` : ""}${order ? `: ${order}` : ""}`,
      href: "/laundry",
    });
  }

  // Unbeantwortete Gästechats (Smoobu, langsam) — mit Zeitbudget
  let chatsUnchecked = false;
  if (opts.withChats !== false) {
    const chats = await Promise.race([
      findUnansweredChats({ organizationId, days: 30 }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), CHAT_CHECK_BUDGET_MS)),
    ]);
    if (!chats) chatsUnchecked = true;
    else {
      if (chats.errors.length) chatsUnchecked = true;
      for (const c of chats.open) {
        items.push({
          key: `chat-${c.booking.id}`, kind: "chat", severity: "amber", date: day(c.booking.checkIn),
          label: `Gästechat beantworten: ${short(c.booking.apartment.name)} ${shortDayLabel(day(c.booking.checkIn))} – ${c.booking.guestName}`,
          href: `/bookings/${c.booking.id}`,
        });
      }
    }
  }

  return { items: sortTodos(items), chatsUnchecked };
}

// ─── „Diese Woche“ ────────────────────────────────────────────────────────────

export interface WeekEntry {
  type: "abreise" | "anreise";
  bookingId: string;
  apartmentName: string;
  apartmentColor: string | null;
  guestName: string;
  guestCount: number;
  /** nur Anreise: Reinigung für diese Anreise */
  cleaner?: string | null;
  cleaningStatus?: string | null;
  selfClean?: boolean;
  hasNote?: boolean;
}

export interface WeekDay {
  day: string;
  label: string;
  entries: WeekEntry[];
}

/** Abreisen, Anreisen und Reinigungen der nächsten 7 Tage (heute + 6) */
export async function loadWeek(organizationId: string, now = new Date()): Promise<WeekDay[]> {
  const today = todayVienna(now);
  const end = addDays(today, 7);
  const rows = await prisma.booking.findMany({
    where: { organizationId, status: "confirmed", OR: [{ checkIn: { gte: today, lt: end } }, { checkOut: { gte: today, lt: end } }] },
    orderBy: { checkIn: "asc" },
    select: {
      id: true, guestName: true, guestCount: true, checkIn: true, checkOut: true,
      apartment: { select: { name: true, color: true } },
      cleaningAssignment: { select: { status: true, isSelfClean: true, notes: true, cleaner: { select: { name: true } } } },
    },
  });

  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = day(addDays(today, i));
    const entries: WeekEntry[] = [];
    for (const b of rows) {
      if (day(b.checkOut) === d) {
        entries.push({ type: "abreise", bookingId: b.id, apartmentName: short(b.apartment.name), apartmentColor: b.apartment.color, guestName: b.guestName, guestCount: b.guestCount });
      }
    }
    for (const b of rows) {
      if (day(b.checkIn) === d) {
        const a = b.cleaningAssignment;
        entries.push({
          type: "anreise", bookingId: b.id, apartmentName: short(b.apartment.name), apartmentColor: b.apartment.color, guestName: b.guestName, guestCount: b.guestCount,
          cleaner: a?.cleaner?.name ?? null, cleaningStatus: a?.status ?? null, selfClean: !!a?.isSelfClean, hasNote: !!a?.notes?.trim(),
        });
      }
    }
    days.push({ day: d, label: i === 0 ? "Heute" : i === 1 ? "Morgen" : shortDayLabel(d), entries });
  }
  return days;
}
