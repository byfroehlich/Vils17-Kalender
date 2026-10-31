import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { defineTool, ToolError } from "../tool";
import { day, addDays, viennaIso, minutesSince, todayVienna } from "../format";
import { datum, wohnungFilter, pagingFields, resolveApartmentId, resolveDays, paging, page } from "../shared";
import { calculateLaundryQuantity, laundryText, fittedSheetsTotal } from "../../laundry-quantity";
import { petFee, PET_FEE_LABEL } from "../../pets";
import { isImapConfigured } from "../../email-import/imap";
import { loadLaundryPlan } from "../../laundry-proposal";
import { laundryAlert, LAUNDRY_ALERT_DAYS } from "../../laundry-order";

const STATUS = ["UNASSIGNED", "ASSIGNED", "COMPLETED", "SELF_CLEAN"] as const;

const STATUS_TEXT: Record<string, string> = {
  UNASSIGNED: "offen",
  ASSIGNED: "zugewiesen",
  COMPLETED: "erledigt",
  SELF_CLEAN: "Selbstreinigung",
};

// Wäsche läuft nach Bestand im Keller, nicht pro Buchung (Entscheidung Mathias 31.10.2026) —
// je Reinigung werden nur die Mengen genannt, kein Status.

// ─── reinigungen ──────────────────────────────────────────────────────────────

export const reinigungen = defineTool({
  name: "reinigungen",
  title: "Reinigungen",
  description:
    "Reinigungsaufträge mit Status (UNASSIGNED/ASSIGNED/COMPLETED/SELF_CLEAN), Reinigungskraft, Absagen und Wäschemengen " +
    "(nach der Wäsche-Konfiguration der Wohnung, nur zur Info). Reinigungstag = Anreisetag der nächsten Gäste. " +
    "Für „Welche Reinigungen sind noch offen?“, „Was hat Vanessa diesen Monat?“. Ob die Wäsche reicht: waesche_bedarf (Bestand im Keller).",
  scope: "cleaning:read",
  input: {
    von: datum.optional().describe("Erster Reinigungstag JJJJ-MM-TT (Vorgabe: heute)"),
    bis: datum.optional().describe("Letzter Reinigungstag, einschließlich (Vorgabe: von + 29 Tage)"),
    status: z.enum(STATUS).optional(),
    nur_absagen: z.boolean().optional().describe("Nur abgesagte Aufträge"),
    nur_waesche_offen: z.boolean().optional().describe("Veraltet: alter Wäschestatus pro Buchung. Wäsche läuft nach Bestand — dafür waesche_bedarf"),
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
              apartment: { select: { name: true, laundryBedsDivisor: true, laundryTowelsPerGuest: true, laundryKitchenCount: true, laundryBeds: true } },
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
              bettsets: fittedSheetsTotal(qty),
              spannbettlaken: { "90er": qty.sheets90, "180er": qty.beds, "200er": qty.sheets200 },
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

// ─── wochenplan ───────────────────────────────────────────────────────────────

export const wochenplan = defineTool({
  name: "wochenplan",
  title: "Wochenplan mit Warnungen",
  description:
    "Planungsübersicht für die nächsten N Tage (Vorgabe 7): je Tag An- und Abreisen, Reinigungen mit Reinigungskraft und Wäschemenge, " +
    "Wäsche-Lage nach Bestand im Keller (14 Tage), dazu eine Liste mit Warnungen — Reinigung ohne Reinigungskraft, abgesagte Reinigung, " +
    "Wäsche reicht nicht (Bestand, nicht pro Buchung), " +
    "Wechseltag (Ab- und Anreise am selben Tag in derselben Wohnung), Hundegebühr nicht angefordert bzw. kurz vor Anreise unbezahlt. Für „Was steht an?“ und den Wochenstart.",
  scope: "cleaning:read",
  input: {
    tage: z.number().int().min(1).max(31).optional().describe("Anzahl Tage ab heute (Vorgabe 7)"),
    wohnung: wohnungFilter,
  },
  async handler(args, ctx) {
    const start = todayVienna();
    const tage = args.tage ?? 7;
    const end = addDays(start, tage);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);

    const rows = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        ...(apartmentId ? { apartmentId } : {}),
        OR: [{ checkIn: { gte: start, lt: end } }, { checkOut: { gte: start, lt: end } }],
      },
      orderBy: [{ checkIn: "asc" }],
      include: {
        apartment: { select: { name: true, laundryBedsDivisor: true, laundryTowelsPerGuest: true, laundryKitchenCount: true, laundryBeds: true } },
        cleaningAssignment: {
          select: { status: true, isSelfClean: true, cleanerUnavailable: true, cleaner: { select: { name: true } } },
        },
      },
    });

    const warnungen: { datum: string; art: string; text: string; buchung_id: string }[] = [];
    const days = [];
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      const key = day(d);
      const inTagen = Math.round((d.getTime() - start.getTime()) / 86_400_000);
      const anreisen = rows.filter((b) => day(b.checkIn) === key);
      const abreisen = rows.filter((b) => day(b.checkOut) === key);

      const reinigungen = anreisen.map((b) => {
        const a = b.cleaningAssignment;
        const selbst = !!a && (a.isSelfClean || a.status === "SELF_CLEAN");
        const zugewiesen = !!a && (selbst || ((a.status === "ASSIGNED" || a.status === "COMPLETED") && !a.cleanerUnavailable));
        const wechsel = abreisen.some((x) => x.apartmentId === b.apartmentId);
        const wo = `${b.apartment.name} (${b.guestName})`;

        if (a?.cleanerUnavailable) warnungen.push({ datum: key, art: "abgesagt", text: `Reinigung ${wo} abgesagt — neu zuweisen`, buchung_id: b.id });
        else if (!zugewiesen) warnungen.push({ datum: key, art: "ohne_reinigungskraft", text: `Reinigung ${wo} hat keine Reinigungskraft`, buchung_id: b.id });
        if (wechsel) warnungen.push({ datum: key, art: "wechseltag", text: `Wechseltag ${b.apartment.name}: Abreise und Anreise am selben Tag`, buchung_id: b.id });
        const fee = petFee(b);
        if (fee.state === "OFFEN") warnungen.push({ datum: key, art: "hundegebuehr_offen", text: `Hundegebühr ${wo}: ${fee.amount} € noch nicht angefordert`, buchung_id: b.id });
        else if (fee.state === "ANGEFORDERT" && inTagen <= 2) warnungen.push({ datum: key, art: "hundegebuehr_unbezahlt", text: `Hundegebühr ${wo}: ${fee.amount} € angefordert, noch nicht bezahlt`, buchung_id: b.id });

        const menge = calculateLaundryQuantity(b.guestCount, b.apartment);
        return {
          buchung_id: b.id,
          wohnung: b.apartment.name,
          anreise_gast: b.guestName,
          personen: b.guestCount,
          haustiere: b.petCount,
          anreise_ab: b.arrivalTime,
          wechsel,
          reinigung: selbst ? "Selbstreinigung" : a?.cleanerUnavailable ? "abgesagt" : a?.cleaner?.name ?? "offen",
          reinigung_status: a ? STATUS_TEXT[a.isSelfClean ? "SELF_CLEAN" : a.status] : "kein Auftrag",
          waesche_menge: laundryText(menge),
          ...(fee.state !== "KEINE" ? { hundegebuehr: `${PET_FEE_LABEL[fee.state]} (${fee.amount} €)` } : {}),
        };
      });

      days.push({
        datum: key,
        anreisen: reinigungen,
        abreisen: abreisen.map((b) => ({ buchung_id: b.id, wohnung: b.apartment.name, gast: b.guestName, abreise_bis: b.departureTime })),
      });
    }

    // Wäsche nach Bestand (Entscheidung Mathias 31.10.2026) — eine Warnung für beide Wohnungen, nicht pro Buchung
    const lw = await loadLaundryPlan({ organizationId: ctx.organizationId, today: start, days: LAUNDRY_ALERT_DAYS });
    const la = laundryAlert(lw.plan);
    const first = lw.plan.firstShortage;
    const waescheBestand = la.noStock
      ? { lage: "Bestand im Keller noch nicht erfasst (waesche_bestand_erfassen)" }
      : la.orderNeeded
        ? {
            lage: first ? `reicht nicht ab ${day(first.day)}` : `reicht nicht für ${LAUNDRY_ALERT_DAYS} Tage`,
            bestellen: laundryText(lw.plan.order) || null,
            ...(la.shortItems.length ? { vor_lieferung_knapp: la.shortItems } : {}),
            ...(first ? { ausloeser: first.arrivals.map((x) => `${x.apartmentName}, ${x.guestCount} Gäste${x.guestCountAssumed ? " (angenommen, Gästezahl unbekannt)" : ""}`) } : {}),
          }
        : { lage: `reicht für ${LAUNDRY_ALERT_DAYS} Tage inkl. Reserve` };
    if (la.orderNeeded) {
      warnungen.unshift({
        datum: first ? day(first.day) : day(start),
        art: "waesche_reicht_nicht",
        text: `Wäsche reicht nicht${first ? ` ab ${day(first.day)}` : ""} — bestellen: ${laundryText(lw.plan.order) || "siehe waesche_bedarf"}`,
        buchung_id: "",
      });
    }
    if (lw.plan.overdueDeliveries) {
      warnungen.push({ datum: day(start), art: "waesche_lieferung_ueberfaellig", text: `${lw.plan.overdueDeliveries} Wäsche-Lieferung(en) überfällig — angekommen? waesche_lieferung_angekommen`, buchung_id: "" });
    }

    return {
      zeitraum: { von: day(start), bis: day(addDays(end, -1)) },
      waesche_bestand: waescheBestand,
      warnungen_gesamt: warnungen.length,
      warnungen,
      tage: days.filter((t) => t.anreisen.length || t.abreisen.length),
      ruhige_tage: days.filter((t) => !t.anreisen.length && !t.abreisen.length).map((t) => t.datum),
    };
  },
});
