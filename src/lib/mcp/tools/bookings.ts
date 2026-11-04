import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool } from "../tool";
import { money, day, addDays, nightsBetween, channelGroup, todayVienna, parseDay } from "../format";
import {
  datum, wohnungFilter, pagingFields, monthPeriodFields,
  resolveApartmentId, resolveDays, resolveMonths, daysInMonth, paging, page,
} from "../shared";
import { isGuestCountUnconfirmed, guestCountSource, UNCONFIRMED_GUEST_COUNT } from "../../guest-count";

// ─── wohnungen_list ───────────────────────────────────────────────────────────

export const wohnungenList = defineTool({
  name: "wohnungen_list",
  title: "Wohnungen",
  description:
    "Listet die Ferienwohnungen (Lodge No. 17, Penthouse No. 17) mit Status, Smoobu-ID, fest zuständiger Reinigungskraft, " +
    "Reinigungssatz und Wäsche-Konfiguration. Benutzen, um Wohnungs-IDs für andere Tools zu finden.",
  scope: "bookings:read",
  input: {
    nur_aktive: z.boolean().optional().describe("Nur aktive Wohnungen (Vorgabe: alle)"),
  },
  async handler(args, ctx) {
    const apts = await prisma.apartment.findMany({
      where: { organizationId: ctx.organizationId, ...(args.nur_aktive ? { active: true } : {}) },
      orderBy: { name: "asc" },
      include: {
        preferredCleaner: { select: { name: true, cleanerRate: true } },
        cleaningRateCleaner: { select: { name: true } },
      },
    });
    return {
      wohnungen: apts.map((a) => ({
        id: a.id,
        name: a.name,
        aktiv: a.active,
        smoobu_id: a.smoobuId,
        reinigungskraft: a.preferredCleaner?.name ?? null,
        reinigungssatz: {
          standard: a.preferredCleaner ? money(a.preferredCleaner.cleanerRate) : null,
          vereinbart:
            a.cleaningRate != null
              ? {
                  ...money(a.cleaningRate),
                  fuer: a.cleaningRateCleaner?.name ?? null,
                  gilt_fuer_buchungen_ab: a.cleaningRateFrom ? day(a.cleaningRateFrom) : null,
                }
              : null,
        },
        waesche: {
          gaeste_pro_bettset: a.laundryBedsDivisor,
          handtuecher_pro_gast: a.laundryTowelsPerGuest,
          kuechentuecher_pro_buchung: a.laundryKitchenCount,
        },
      })),
    };
  },
});

// ─── buchungen_list ───────────────────────────────────────────────────────────

export const buchungenList = defineTool({
  name: "buchungen_list",
  title: "Buchungen",
  description:
    "Listet Buchungen, die einen Zeitraum berühren (Aufenthalt überschneidet von–bis). Für Fragen wie „Wer ist im November da?“, " +
    "„Welche Booking.com-Buchungen gibt es?“. Felder: Gast, Personen (mit gaestezahl_quelle smoobu/von_hand/portal_mail/unbekannt und gaestezahl_bestaetigt), Haustiere, Check-in/-out, Uhrzeiten, Kanal, Preis, Status, Hinweis. " +
    "Der Preis ist der Betrag laut Smoobu (Auszahlung an Gastgeber, wenn Smoobu ihn liefert, sonst Gesamtpreis).",
  scope: "bookings:read",
  input: {
    von: datum.optional().describe("Erster Tag JJJJ-MM-TT (Vorgabe: heute)"),
    bis: datum.optional().describe("Letzter Tag JJJJ-MM-TT, einschließlich (Vorgabe: von + 89 Tage)"),
    wohnung: wohnungFilter,
    kanal: z.enum(["Airbnb", "Booking.com", "Direkt"]).optional(),
    status: z.enum(["bestaetigt", "storniert", "alle"]).optional().describe("Vorgabe: bestaetigt"),
    ...pagingFields,
  },
  async handler(args, ctx) {
    const { start, endExclusive } = resolveDays(args.von, args.bis);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const status = args.status ?? "bestaetigt";
    const { take, skip } = paging(args);

    const rows = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        checkIn: { lt: endExclusive },
        checkOut: { gt: start },
        ...(apartmentId ? { apartmentId } : {}),
        ...(status === "bestaetigt" ? { status: "confirmed" } : status === "storniert" ? { status: "cancelled" } : {}),
      },
      orderBy: [{ checkIn: "asc" }, { id: "asc" }],
      include: { apartment: { select: { name: true } } },
    });

    const filtered = args.kanal ? rows.filter((b) => channelGroup(b.channelName) === args.kanal) : rows;
    const slice = filtered.slice(skip, skip + take + 1);

    return {
      zeitraum: { von: day(start), bis: day(addDays(endExclusive, -1)) },
      gesamt: filtered.length,
      ...page(
        slice.map((b) => ({
          id: b.id,
          wohnung: b.apartment.name,
          gast: b.guestName,
          personen: b.guestCount,
          personen_von_hand_korrigiert: b.guestCountManual,
          gaestezahl_quelle: guestCountSource(b),
          gaestezahl_bestaetigt: !isGuestCountUnconfirmed(b),
          haustiere: b.petCount,
          check_in: day(b.checkIn),
          check_out: day(b.checkOut),
          naechte: nightsBetween(b.checkIn, b.checkOut),
          anreise_ab: b.arrivalTime,
          abreise_bis: b.departureTime,
          kanal: channelGroup(b.channelName),
          kanal_original: b.channelName,
          preis: b.price != null ? money(b.price) : null,
          status: b.status === "confirmed" ? "bestaetigt" : b.status === "cancelled" ? "storniert" : b.status,
          hinweis: b.channelNotice,
        })),
        take,
        skip
      ),
    };
  },
});

// ─── gaestezahl_offen ─────────────────────────────────────────────────────────

export const gaestezahlOffen = defineTool({
  name: "gaestezahl_offen",
  title: "Unbestätigte Gästezahlen",
  description:
    "Listet kommende Buchungen, deren Gästezahl unbekannt ist: Das Portal (meist Booking.com über Smoobu) hat keine geliefert, " +
    "in der App steht nur ein Platzhalter, und weder Hand-Eingabe noch Portal-Mail haben sie geklärt. " +
    "Für „Wo fehlt die Gästezahl?“. Klären: im Portal/Extranet oder in den Bestätigungsmails (postfach, mail_lesen) nachsehen, " +
    "dann gaestezahl_korrigieren. Die Wäscheplanung rechnet bis dahin mit voller Belegung.",
  scope: "bookings:read",
  input: {
    tage: z.number().int().min(1).max(400).optional().describe("Anreisen in den nächsten N Tagen (Vorgabe 60)"),
  },
  async handler(args, ctx) {
    const today = todayVienna();
    const tage = args.tage ?? 60;
    const rows = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        ...UNCONFIRMED_GUEST_COUNT,
        checkOut: { gte: today },
        checkIn: { lt: addDays(today, tage) },
      },
      orderBy: { checkIn: "asc" },
      include: { apartment: { select: { name: true } } },
    });
    return {
      zeitraum: { von: day(today), bis: day(addDays(today, tage - 1)) },
      anzahl: rows.length,
      buchungen: rows.map((b) => ({
        buchung_id: b.id,
        wohnung: b.apartment.name,
        gast: b.guestName,
        check_in: day(b.checkIn),
        check_out: day(b.checkOut),
        kanal: channelGroup(b.channelName),
        platzhalter_personen: b.guestCount,
        smoobu_id: b.smoobuId,
        push_gemeldet: b.guestCountReminderSentAt != null,
      })),
      hinweis: rows.length ? "Gästezahl im Portal oder in der Bestätigungsmail nachsehen und mit gaestezahl_korrigieren eintragen." : "Alle Gästezahlen sind bestätigt.",
    };
  },
});

// ─── anreisen_abreisen ────────────────────────────────────────────────────────

export const anreisenAbreisen = defineTool({
  name: "anreisen_abreisen",
  title: "An- und Abreisen",
  description:
    "Zeigt pro Tag, wer anreist und wer abreist — für ein Datum oder die nächsten N Tage — und ob die Reinigung vor der Anreise " +
    "zugewiesen ist. Für „Was steht diese Woche an?“, „Wer kommt morgen?“. Wechseltage (Abreise und Anreise in derselben Wohnung) sind markiert.",
  scope: "bookings:read",
  input: {
    datum: datum.optional().describe("Starttag JJJJ-MM-TT (Vorgabe: heute)"),
    tage: z.number().int().min(1).max(60).optional().describe("Anzahl Tage ab Starttag (Vorgabe: 7, bzw. 1 wenn datum gesetzt)"),
    wohnung: wohnungFilter,
  },
  async handler(args, ctx) {
    const start = args.datum ? parseDay(args.datum) : todayVienna();
    const tage = args.tage ?? (args.datum ? 1 : 7);
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
        apartment: { select: { name: true } },
        cleaningAssignment: { select: { status: true, isSelfClean: true, cleanerUnavailable: true, cleaner: { select: { name: true } } } },
      },
    });

    const days = [];
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      const key = day(d);
      const anreisen = rows.filter((b) => day(b.checkIn) === key);
      const abreisen = rows.filter((b) => day(b.checkOut) === key);
      days.push({
        datum: key,
        anreisen: anreisen.map((b) => {
          const a = b.cleaningAssignment;
          const zugewiesen = !!a && (a.status === "ASSIGNED" || a.status === "COMPLETED" || a.status === "SELF_CLEAN" || a.isSelfClean);
          return {
            buchung_id: b.id,
            wohnung: b.apartment.name,
            gast: b.guestName,
            personen: b.guestCount,
            haustiere: b.petCount,
            anreise_ab: b.arrivalTime,
            naechte: nightsBetween(b.checkIn, b.checkOut),
            kanal: channelGroup(b.channelName),
            reinigung: {
              zugewiesen,
              status: a ? (a.isSelfClean ? "SELF_CLEAN" : a.status) : "KEINE",
              reinigungskraft: a?.status === "ASSIGNED" || a?.status === "COMPLETED" ? a.cleaner?.name ?? null : null,
              abgesagt: a?.cleanerUnavailable ?? false,
            },
            wechsel: abreisen.some((x) => x.apartmentId === b.apartmentId),
          };
        }),
        abreisen: abreisen.map((b) => ({
          buchung_id: b.id,
          wohnung: b.apartment.name,
          gast: b.guestName,
          abreise_bis: b.departureTime,
        })),
      });
    }

    const offen = days.flatMap((d) => d.anreisen).filter((a) => !a.reinigung.zugewiesen).length;
    return {
      zeitraum: { von: day(start), bis: day(addDays(end, -1)) },
      anreisen_gesamt: days.reduce((s, d) => s + d.anreisen.length, 0),
      abreisen_gesamt: days.reduce((s, d) => s + d.abreisen.length, 0),
      reinigungen_ohne_zuweisung: offen,
      tage: days,
    };
  },
});

// ─── belegung ─────────────────────────────────────────────────────────────────

export const belegung = defineTool({
  name: "belegung",
  title: "Belegung und Lücken",
  description:
    "Auslastung in % je Wohnung und Monat (belegte Nächte / Nächte im Monat) und freie Lücken ab einem Datum — " +
    "für Last-Minute-Preise und Planung. Stornierte Buchungen zählen nicht.",
  scope: "bookings:read",
  input: {
    ...monthPeriodFields,
    wohnung: wohnungFilter,
    luecken_ab: datum.optional().describe("Lücken ab diesem Tag suchen (Vorgabe: heute)"),
    luecken_tage: z.number().int().min(1).max(365).optional().describe("Wie weit nach vorn Lücken suchen (Vorgabe: 60 Tage)"),
    min_naechte: z.number().int().min(1).max(30).optional().describe("Nur Lücken ab so vielen Nächten (Vorgabe: 1)"),
  },
  async handler(args, ctx) {
    const { start, end, months } = resolveMonths(args);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const gapStart = args.luecken_ab ? parseDay(args.luecken_ab) : todayVienna();
    const gapEnd = addDays(gapStart, args.luecken_tage ?? 60);
    const minNights = args.min_naechte ?? 1;

    const apts = await prisma.apartment.findMany({
      where: { organizationId: ctx.organizationId, active: true, ...(apartmentId ? { id: apartmentId } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const lo = start < gapStart ? start : gapStart;
    const hi = end > gapEnd ? end : gapEnd;
    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        apartmentId: { in: apts.map((a) => a.id) },
        checkIn: { lt: hi },
        checkOut: { gt: lo },
      },
      select: { apartmentId: true, checkIn: true, checkOut: true },
    });

    return {
      monate: months,
      wohnungen: apts.map((apt) => {
        // belegte Nächte als Menge von Kalendertagen
        const occupied = new Set<string>();
        for (const b of bookings.filter((x) => x.apartmentId === apt.id)) {
          for (let d = new Date(b.checkIn); d < b.checkOut; d = addDays(d, 1)) occupied.add(day(d));
        }

        const auslastung = months.map((m) => {
          const total = daysInMonth(m);
          let belegt = 0;
          for (let i = 1; i <= total; i++) if (occupied.has(`${m}-${String(i).padStart(2, "0")}`)) belegt++;
          return {
            monat: m,
            belegte_naechte: belegt,
            naechte_im_monat: total,
            auslastung_prozent: Math.round((belegt / total) * 1000) / 10,
          };
        });
        const belegtGesamt = auslastung.reduce((s, x) => s + x.belegte_naechte, 0);
        const naechteGesamt = auslastung.reduce((s, x) => s + x.naechte_im_monat, 0);

        // freie Lücken: zusammenhängende freie Nächte
        const luecken: { von: string; bis: string; naechte: number }[] = [];
        let runStart: Date | null = null;
        for (let d = new Date(gapStart); d <= gapEnd; d = addDays(d, 1)) {
          const free = d < gapEnd && !occupied.has(day(d));
          if (free && !runStart) runStart = new Date(d);
          if (!free && runStart) {
            const n = nightsBetween(runStart, d);
            if (n >= minNights) luecken.push({ von: day(runStart), bis: day(d), naechte: n });
            runStart = null;
          }
        }

        return {
          id: apt.id,
          name: apt.name,
          auslastung,
          gesamt: {
            belegte_naechte: belegtGesamt,
            naechte: naechteGesamt,
            auslastung_prozent: naechteGesamt ? Math.round((belegtGesamt / naechteGesamt) * 1000) / 10 : 0,
          },
          freie_luecken: {
            ab: day(gapStart),
            bis: day(addDays(gapEnd, -1)),
            hinweis: "von = erste freie Nacht (Anreisetag), bis = Abreisetag",
            luecken,
          },
        };
      }),
    };
  },
});

