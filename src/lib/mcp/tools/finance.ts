import { z } from "zod";
import { prisma } from "../../prisma";
import { defineTool, ToolError } from "../tool";
import { money, day, addDays, nightsBetween, channelGroup, monthKey, parseDay, viennaIso } from "../format";
import { datum, wohnungFilter, monthPeriodFields, resolveApartmentId, resolveMonths, nightsPerMonth } from "../shared";
import { effectiveRate, isPremiumFor } from "../../rates";

const KANAELE = ["Airbnb", "Booking.com", "Direkt"] as const;
type Kanal = (typeof KANAELE)[number];

// ─── umsatz ───────────────────────────────────────────────────────────────────

/** Erster Booking.com-Zahltag (14-tägig freitags ab Anker) nach der Abreise */
export function nextBookingPayout(checkOut: Date, anchor: Date): Date {
  const cycle = 14 * 86_400_000;
  const after = addDays(checkOut, 1).getTime();
  const k = Math.ceil((after - anchor.getTime()) / cycle);
  return new Date(anchor.getTime() + Math.max(k, 0) * cycle);
}

export const umsatz = defineTool({
  name: "umsatz",
  title: "Umsatz und erwartete Auszahlungen",
  description:
    "Umsatz je Monat und Kanal (Airbnb, Booking.com, Direkt): Summe, Nächte, Ø Preis pro Nacht — dazu die erwarteten " +
    "Auszahlungen der Portale als SCHÄTZUNG (Airbnb 1 Tag nach Anreise, Booking.com 14-tägig freitags nach Abreise). " +
    "Für Liquiditätsplanung und „Wie viel Umsatz hatten wir 2026?“. Grundlage ist der Preis laut Smoobu; stornierte Buchungen zählen nicht.",
  scope: "finance:read",
  input: {
    ...monthPeriodFields,
    wohnung: wohnungFilter,
    zuordnung: z
      .enum(["naechte", "anreise"])
      .optional()
      .describe("naechte = Umsatz anteilig auf die Monate der Übernachtungen verteilt (Vorgabe); anreise = ganzer Betrag im Anreisemonat"),
    booking_zahltag_anker: datum
      .optional()
      .describe("Ein bekannter Booking.com-Zahltag (Freitag) als Taktgeber für den 14-Tage-Rhythmus (Vorgabe 2026-01-02)"),
  },
  async handler(args, ctx) {
    const { start, end, months } = resolveMonths(args);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    const zuordnung = args.zuordnung ?? "naechte";
    const anchor = parseDay(args.booking_zahltag_anker ?? "2026-01-02");
    if (anchor.getUTCDay() !== 5) throw new ToolError("booking_zahltag_anker muss ein Freitag sein");

    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        ...(apartmentId ? { apartmentId } : {}),
        ...(zuordnung === "anreise"
          ? { checkIn: { gte: start, lt: end } }
          : { checkIn: { lt: end }, checkOut: { gt: start } }),
      },
      select: { id: true, checkIn: true, checkOut: true, price: true, channelName: true },
    });

    type Cell = { summe: number; naechte: number; buchungen: Set<string> };
    const grid = new Map<string, Cell>();
    const cell = (m: string, k: Kanal) => {
      const key = `${m}|${k}`;
      if (!grid.has(key)) grid.set(key, { summe: 0, naechte: 0, buchungen: new Set() });
      return grid.get(key)!;
    };

    let ohnePreis = 0;
    for (const b of bookings) {
      const k = channelGroup(b.channelName);
      const total = nightsBetween(b.checkIn, b.checkOut);
      if (b.price == null) ohnePreis++;
      const price = b.price ?? 0;
      if (zuordnung === "anreise") {
        const c = cell(monthKey(b.checkIn), k);
        c.summe += price;
        c.naechte += total;
        c.buchungen.add(b.id);
      } else {
        for (const [m, n] of Object.entries(nightsPerMonth(b.checkIn, b.checkOut, start, end))) {
          const c = cell(m, k);
          c.summe += total > 0 ? (price * n) / total : 0;
          c.naechte += n;
          c.buchungen.add(b.id);
        }
      }
    }

    const fmt = (c: { summe: number; naechte: number; buchungen: number }) => ({
      summe: money(c.summe),
      naechte: c.naechte,
      buchungen: c.buchungen,
      preis_pro_nacht: c.naechte > 0 ? money(c.summe / c.naechte) : null,
    });

    const monate = months.map((m) => {
      const kanaele = Object.fromEntries(
        KANAELE.map((k) => {
          const c = grid.get(`${m}|${k}`);
          return [k, fmt({ summe: c?.summe ?? 0, naechte: c?.naechte ?? 0, buchungen: c?.buchungen.size ?? 0 })];
        })
      );
      const all = KANAELE.map((k) => grid.get(`${m}|${k}`)).filter(Boolean) as Cell[];
      return {
        monat: m,
        gesamt: fmt({
          summe: all.reduce((s, c) => s + c.summe, 0),
          naechte: all.reduce((s, c) => s + c.naechte, 0),
          buchungen: new Set(all.flatMap((c) => Array.from(c.buchungen))).size,
        }),
        kanaele,
      };
    });

    const jeKanal = Object.fromEntries(
      KANAELE.map((k) => {
        const cells = months.map((m) => grid.get(`${m}|${k}`)).filter(Boolean) as Cell[];
        return [k, fmt({
          summe: cells.reduce((s, c) => s + c.summe, 0),
          naechte: cells.reduce((s, c) => s + c.naechte, 0),
          buchungen: new Set(cells.flatMap((c) => Array.from(c.buchungen))).size,
        })];
      })
    );
    const allCells = Array.from(grid.values());

    // Erwartete Auszahlungen (Schätzung) — volle Buchungsbeträge je Zahltag
    const payouts = new Map<string, { datum: string | null; kanal: Kanal; summe: number; buchungen: number }>();
    for (const b of bookings) {
      const k = channelGroup(b.channelName);
      const date = k === "Airbnb" ? day(addDays(b.checkIn, 1)) : k === "Booking.com" ? day(nextBookingPayout(b.checkOut, anchor)) : null;
      const key = `${date}|${k}`;
      const p = payouts.get(key) ?? { datum: date, kanal: k, summe: 0, buchungen: 0 };
      p.summe += b.price ?? 0;
      p.buchungen += 1;
      payouts.set(key, p);
    }

    return {
      zeitraum: { von_monat: months[0], bis_monat: months[months.length - 1] },
      zuordnung,
      gesamt: fmt({
        summe: allCells.reduce((s, c) => s + c.summe, 0),
        naechte: allCells.reduce((s, c) => s + c.naechte, 0),
        buchungen: new Set(allCells.flatMap((c) => Array.from(c.buchungen))).size,
      }),
      je_kanal: jeKanal,
      monate,
      erwartete_auszahlungen: {
        schaetzung: true,
        hinweis:
          "Schätzung, keine Buchhaltung: Airbnb zahlt üblicherweise 1 Tag nach Anreise, Booking.com 14-tägig freitags nach Abreise " +
          "(Takt über booking_zahltag_anker). Beträge = Preis laut Smoobu; Provisionen/Gebühren können abweichen. Direktbuchungen ohne Datum.",
        auszahlungen: Array.from(payouts.values())
          .sort((a, b) => (a.datum ?? "9999").localeCompare(b.datum ?? "9999"))
          .map((p) => ({ datum: p.datum, kanal: p.kanal, betrag: money(p.summe), buchungen: p.buchungen })),
      },
      buchungen_ohne_preis: ohnePreis,
    };
  },
});

// ─── ortstaxe ─────────────────────────────────────────────────────────────────

export const ortstaxe = defineTool({
  name: "ortstaxe",
  title: "Ortstaxe",
  description:
    "Ortstaxe (Aufenthaltsabgabe) je Monat: Nächte × abgabepflichtige Personen × 3,00 € (TVB Naturparkregion Reutte, seit 01.12.2024). Für die Monatsmeldung. " +
    "Die App kennt nur die Gesamtzahl der Gäste — Vorgabe ist daher: alle Gäste zählen. Kinder lassen sich je Buchung abziehen " +
    "(kinder: [{buchung_id, anzahl}]). Mit kinder_zaehlen=false werden zusätzlich, wo bekannt, nur die Erwachsenen aus der " +
    "Portal-Mail gezählt; Buchungen ohne Aufteilung werden gemeldet.",
  scope: "finance:read",
  input: {
    ...monthPeriodFields,
    wohnung: wohnungFilter,
    satz: z.number().min(0).max(50).optional().describe("Euro pro Person und Nacht (Vorgabe 3,00)"),
    kinder: z
      .array(z.object({ buchung_id: z.string().min(1), anzahl: z.number().int().min(0).max(20) }))
      .max(500)
      .optional()
      .describe("Kinder je Buchung abziehen, z.B. [{\"buchung_id\": \"…\", \"anzahl\": 2}]. Hat Vorrang vor der Portal-Mail."),
    kinder_zaehlen: z
      .boolean()
      .optional()
      .describe("false = Erwachsene aus der Portal-Mail verwenden, wo vorhanden (Vorgabe: true = alle Gäste zählen)"),
  },
  async handler(args, ctx) {
    const { start, end, months } = resolveMonths(args);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    // Aufenthaltsabgabe TVB Naturparkregion Reutte: 3,00 € pro Person und Nacht, gültig seit 01.12.2024
    const satz = args.satz ?? 3;
    const kinder = args.kinder_zaehlen ?? true;

    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "confirmed",
        ...(apartmentId ? { apartmentId } : {}),
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      select: { id: true, checkIn: true, checkOut: true, guestCount: true },
    });

    // Erwachsene aus den Portal-Mails (jüngster Import je Buchung)
    const adults = new Map<string, number>();
    if (!kinder && bookings.length) {
      const imports = await prisma.emailImport.findMany({
        where: { organizationId: ctx.organizationId, bookingId: { in: bookings.map((b) => b.id) }, parsedAdults: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { bookingId: true, parsedAdults: true },
      });
      for (const i of imports) if (i.bookingId && i.parsedAdults != null) adults.set(i.bookingId, i.parsedAdults);
    }

    // Ausdrücklich angegebene Kinder je Buchung
    const children = new Map((args.kinder ?? []).map((k) => [k.buchung_id, k.anzahl]));
    const known = new Set(bookings.map((b) => b.id));
    const unbekannt = Array.from(children.keys()).filter((id) => !known.has(id));

    const rows = new Map(months.map((m) => [m, { buchungen: new Set<string>(), naechte: 0, personen_naechte: 0, unsicher: new Set<string>() }]));
    for (const b of bookings) {
      // Vorrang: angegebene Kinder → Erwachsene aus der Portal-Mail → alle Gäste
      const persons = children.has(b.id)
        ? Math.max(0, b.guestCount - children.get(b.id)!)
        : kinder
          ? b.guestCount
          : adults.get(b.id) ?? b.guestCount;
      const unsure = !kinder && !children.has(b.id) && !adults.has(b.id);
      for (const [m, n] of Object.entries(nightsPerMonth(b.checkIn, b.checkOut, start, end))) {
        const r = rows.get(m);
        if (!r) continue;
        r.buchungen.add(b.id);
        r.naechte += n;
        r.personen_naechte += n * persons;
        if (unsure) r.unsicher.add(b.id);
      }
    }

    const monate = months.map((m) => {
      const r = rows.get(m)!;
      return {
        monat: m,
        buchungen: r.buchungen.size,
        naechte: r.naechte,
        personen_naechte: r.personen_naechte,
        betrag: money(r.personen_naechte * satz),
        ...(kinder ? {} : { buchungen_ohne_aufteilung: r.unsicher.size }),
      };
    });

    return {
      satz: money(satz),
      kinder_gezaehlt: kinder && children.size === 0,
      kinder_abgezogen_bei_buchungen: children.size - unbekannt.length,
      ...(unbekannt.length ? { unbekannte_buchung_ids: unbekannt } : {}),
      gesamt: {
        personen_naechte: monate.reduce((s, m) => s + m.personen_naechte, 0),
        betrag: money(monate.reduce((s, m) => s + m.personen_naechte, 0) * satz),
      },
      monate,
      hinweis:
        "Gezählt wird pro Nacht und Erwachsenem. Die App kennt nur die Gesamtzahl der Gäste" +
        (children.size
          ? `; bei ${children.size - unbekannt.length} Buchung(en) wurden die angegebenen Kinder abgezogen.`
          : kinder
            ? " — Kinder sind hier mitgezählt. Kinder je Buchung mit dem Parameter kinder abziehen."
            : "; wo die Portal-Mail die Aufteilung enthielt, zählen nur Erwachsene, sonst alle Gäste (buchungen_ohne_aufteilung)."),
    };
  },
});

// ─── auszahlungen_reinigung ───────────────────────────────────────────────────

export const auszahlungenReinigung = defineTool({
  name: "auszahlungen_reinigung",
  title: "Auszahlungen an Reinigungskräfte",
  description:
    "Beträge je Reinigungskraft und Monat für erledigte Reinigungen: gesamt, bereits ausgezahlt, noch offen. " +
    "Gleiche Rechnung wie die Abrechnung in der App (festgeschriebener Satz, sonst vereinbarter Betrag, sonst Standardsatz). " +
    "Monat = Abreisemonat, wie beim „als ausgezahlt markieren“.",
  scope: "finance:read",
  input: {
    ...monthPeriodFields,
    reinigungskraft: z.string().optional().describe("ID oder Name (Teil) der Reinigungskraft"),
    nur_offen: z.boolean().optional().describe("Nur Monate mit offenem Betrag"),
  },
  async handler(args, ctx) {
    const { start, end } = resolveMonths(args);

    let cleanerId: string | undefined;
    if (args.reinigungskraft) {
      const users = await prisma.user.findMany({
        where: { organizationId: ctx.organizationId, role: "CLEANER" },
        select: { id: true, name: true },
      });
      const hit = users.filter((u) => u.id === args.reinigungskraft || u.name.toLowerCase().includes(args.reinigungskraft!.toLowerCase()));
      if (hit.length !== 1) {
        throw new ToolError(hit.length ? `"${args.reinigungskraft}" ist mehrdeutig` : `Keine Reinigungskraft "${args.reinigungskraft}". Vorhanden: ${users.map((u) => u.name).join(", ")}`);
      }
      cleanerId = hit[0].id;
    }

    const rows = await prisma.cleaningAssignment.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "COMPLETED",
        cleanerId: cleanerId ?? { not: null },
        booking: { checkOut: { gte: start, lt: end } },
      },
      select: {
        rate: true,
        cleanerId: true,
        paidOut: true,
        paidOutAt: true,
        cleaner: { select: { name: true, cleanerRate: true } },
        booking: { select: { checkOut: true, premiumRate: true, premiumRateCleanerId: true } },
      },
    });

    type G = { name: string; monat: string; anzahl: number; eigene: number; gesamt: number; bezahlt: number; bezahltAm: Date | null };
    const groups = new Map<string, G>();
    for (const a of rows) {
      const m = monthKey(a.booking.checkOut);
      const key = `${a.cleanerId}|${m}`;
      const g = groups.get(key) ?? { name: a.cleaner?.name ?? "?", monat: m, anzahl: 0, eigene: 0, gesamt: 0, bezahlt: 0, bezahltAm: null };
      const r = effectiveRate(a);
      g.anzahl++;
      if (isPremiumFor(a.booking, a.cleanerId)) g.eigene++;
      g.gesamt += r;
      if (a.paidOut) {
        g.bezahlt += r;
        if (a.paidOutAt && (!g.bezahltAm || a.paidOutAt > g.bezahltAm)) g.bezahltAm = a.paidOutAt;
      }
      groups.set(key, g);
    }

    let list = Array.from(groups.values()).sort((a, b) => a.monat.localeCompare(b.monat) || a.name.localeCompare(b.name));
    if (args.nur_offen) list = list.filter((g) => g.gesamt - g.bezahlt > 0.004);

    return {
      gesamt_offen: money(list.reduce((s, g) => s + g.gesamt - g.bezahlt, 0)),
      eintraege: list.map((g) => {
        const offen = g.gesamt - g.bezahlt;
        return {
          reinigungskraft: g.name,
          monat: g.monat,
          reinigungen: g.anzahl,
          davon_mit_vereinbartem_betrag: g.eigene,
          gesamt: money(g.gesamt),
          ausgezahlt: money(g.bezahlt),
          offen: money(offen),
          status: offen < 0.005 ? "ausgezahlt" : g.bezahlt > 0 ? "teilweise" : "offen",
          ausgezahlt_am: viennaIso(g.bezahltAm),
        };
      }),
      hinweis: "Nur erledigte Reinigungen. Geplante oder offene Reinigungen erscheinen hier erst nach „erledigt“.",
    };
  },
});
