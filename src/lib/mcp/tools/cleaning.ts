import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { defineTool, ToolError } from "../tool";
import { day, addDays, viennaIso, minutesSince } from "../format";
import { datum, wohnungFilter, pagingFields, resolveApartmentId, resolveDays, paging, page } from "../shared";
import { calculateLaundryQuantity } from "../../laundry-quantity";
import { isImapConfigured } from "../../email-import/imap";

const STATUS = ["UNASSIGNED", "ASSIGNED", "COMPLETED", "SELF_CLEAN"] as const;

const STATUS_TEXT: Record<string, string> = {
  UNASSIGNED: "offen",
  ASSIGNED: "zugewiesen",
  COMPLETED: "erledigt",
  SELF_CLEAN: "Selbstreinigung",
};

const LAUNDRY_TEXT: Record<string, string> = { OPEN: "offen", ORDERED: "bestellt", AVAILABLE: "vorhanden" };

// ─── reinigungen ──────────────────────────────────────────────────────────────

export const reinigungen = defineTool({
  name: "reinigungen",
  title: "Reinigungen",
  description:
    "Reinigungsaufträge mit Status (UNASSIGNED/ASSIGNED/COMPLETED/SELF_CLEAN), Reinigungskraft, Absagen und Wäsche " +
    "(Status und Mengen nach der Wäsche-Konfiguration der Wohnung). Reinigungstag = Anreisetag der nächsten Gäste. " +
    "Für „Welche Reinigungen sind noch offen?“, „Was hat Vanessa diesen Monat?“, „Wo fehlt die Wäsche?“.",
  scope: "cleaning:read",
  input: {
    von: datum.optional().describe("Erster Reinigungstag JJJJ-MM-TT (Vorgabe: heute)"),
    bis: datum.optional().describe("Letzter Reinigungstag, einschließlich (Vorgabe: von + 29 Tage)"),
    status: z.enum(STATUS).optional(),
    nur_absagen: z.boolean().optional().describe("Nur abgesagte Aufträge"),
    nur_waesche_offen: z.boolean().optional().describe("Nur Aufträge, deren Wäsche noch nicht bestellt/vorhanden ist"),
    reinigungskraft: z.string().optional().describe("ID oder Name (Teil) der Reinigungskraft"),
    wohnung: wohnungFilter,
    ...pagingFields,
  },
  async handler(args, ctx) {
    const { start, endExclusive } = resolveDays(args.von, args.bis, 30);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const { take, skip } = paging(args);

    let cleanerId: string | undefined;
    if (args.reinigungskraft) {
      const users = await prisma.user.findMany({
        where: { organizationId: ctx.organizationId, role: "CLEANER" },
        select: { id: true, name: true },
      });
      const hit = users.filter((u) => u.id === args.reinigungskraft || u.name.toLowerCase().includes(args.reinigungskraft!.toLowerCase()));
      if (hit.length !== 1) throw new ToolError(`Reinigungskraft "${args.reinigungskraft}" nicht eindeutig gefunden. Vorhanden: ${users.map((u) => u.name).join(", ")}`);
      cleanerId = hit[0].id;
    }

    const where: Prisma.CleaningAssignmentWhereInput = {
      organizationId: ctx.organizationId,
      booking: {
        status: "confirmed",
        checkIn: { gte: start, lt: endExclusive },
        ...(apartmentId ? { apartmentId } : {}),
      },
      ...(args.nur_absagen ? { cleanerUnavailable: true } : {}),
      ...(args.nur_waesche_offen ? { laundryStatus: "OPEN" } : {}),
      // Status-Filter hat Vorrang; "Wäsche offen" blendet sonst erledigte aus
      ...(args.status ? { status: args.status } : args.nur_waesche_offen ? { status: { not: "COMPLETED" } } : {}),
      ...(cleanerId ? { OR: [{ cleanerId }, { declinedById: cleanerId }] } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.cleaningAssignment.count({ where }),
      prisma.cleaningAssignment.findMany({
        where,
        orderBy: [{ booking: { checkIn: "asc" } }, { id: "asc" }],
        skip,
        take: take + 1,
        include: {
          cleaner: { select: { name: true } },
          declinedBy: { select: { name: true } },
          booking: {
            select: {
              id: true, checkIn: true, checkOut: true, guestCount: true, petCount: true, arrivalTime: true, channelNotice: true,
              apartment: { select: { name: true, laundryBedsDivisor: true, laundryTowelsPerGuest: true, laundryKitchenCount: true } },
            },
          },
        },
      }),
    ]);

    return {
      zeitraum: { von: day(start), bis: day(addDays(endExclusive, -1)) },
      gesamt: total,
      ...page(
        rows.map((a) => {
          const status = a.isSelfClean && a.status === "UNASSIGNED" ? "SELF_CLEAN" : a.status;
          const qty = calculateLaundryQuantity(a.booking.guestCount, a.booking.apartment);
          return {
            buchung_id: a.booking.id,
            reinigungstag: day(a.booking.checkIn),
            anreise_ab: a.booking.arrivalTime,
            wohnung: a.booking.apartment.name,
            status,
            status_text: STATUS_TEXT[status] ?? status,
            reinigungskraft: status === "ASSIGNED" || status === "COMPLETED" ? a.cleaner?.name ?? null : null,
            absage: a.cleanerUnavailable
              ? { von: a.cleaner?.name ?? a.declinedBy?.name ?? null, grund: a.cleanerUnavailableNote, am: viennaIso(a.cleanerUnavailableAt) }
              : null,
            frueher_abgesagt_von: !a.cleanerUnavailable && a.declinedBy ? a.declinedBy.name : null,
            naechste_gaeste: a.booking.guestCount,
            haustiere: a.booking.petCount,
            waesche: {
              status: LAUNDRY_TEXT[a.laundryStatus] ?? a.laundryStatus,
              bettsets: qty.beds,
              handtuecher: qty.towels,
              kuechentuecher: qty.kitchen,
            },
            notiz: a.notes,
            portal_hinweis: a.booking.channelNotice,
          };
        }),
        take,
        skip
      ),
    };
  },
});

// ─── sync_status ──────────────────────────────────────────────────────────────

export const syncStatus = defineTool({
  name: "sync_status",
  title: "Sync-Status",
  description:
    "Zeigt, wie aktuell die Daten sind: letzter Smoobu-Sync, letzter E-Mail-Import der Portal-Mails und deren Fehler. " +
    "Vor Auswertungen aufrufen, wenn Zahlen veraltet wirken.",
  scope: "bookings:read",
  input: {},
  async handler(_args, ctx) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [org, lastImport, counts, problems] = await Promise.all([
      prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { lastSyncAt: true } }),
      prisma.emailImport.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.emailImport.groupBy({
        by: ["status"],
        where: { organizationId: ctx.organizationId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.emailImport.findMany({
        where: { organizationId: ctx.organizationId, status: { in: ["ERROR", "UNMATCHED", "AMBIGUOUS"] }, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, status: true, portal: true, detail: true },
      }),
    ]);

    const age = minutesSince(org?.lastSyncAt ?? null);
    return {
      smoobu: {
        letzter_sync: viennaIso(org?.lastSyncAt),
        vor_minuten: age,
        aktuell: age !== null && age <= 30,
        authentifizierung: process.env.SMOOBU_API_SECRET ? "HMAC" : "alter Api-Key-Header (SMOOBU_API_SECRET fehlt)",
        hinweis:
          "Der Sync läuft alle 15 Min per Cron und zusätzlich beim Öffnen der App. Fehler einzelner Läufe werden nicht gespeichert — " +
          "ist „aktuell“ false, läuft der Sync nicht.",
      },
      email_import: {
        eingerichtet: isImapConfigured(),
        letzter_import: viennaIso(lastImport?.createdAt),
        letzte_7_tage: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        probleme: problems.map((p) => ({ am: viennaIso(p.createdAt), status: p.status, portal: p.portal, detail: p.detail })),
      },
    };
  },
});
