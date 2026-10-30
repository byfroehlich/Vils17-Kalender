import { z } from "zod";
import { prisma } from "../../prisma";
import { Prisma } from "@prisma/client";
import { resolveApartmentId } from "../shared";
import { defineTool, preview, bestaetigtSchema } from "../tool";
import { day, addDays, todayVienna, parseDay } from "../format";
import { datum } from "../shared";
import { loadLaundryPlan, saveLaundryCount, recordLaundryDelivery, setLaundryReserve } from "../../laundry-proposal";
import { LAUNDRY_ITEMS, laundryText, emptyLaundryQuantity, parseLaundryBeds, calculateLaundryQuantity, type LaundryQuantity } from "../../laundry-quantity";
import { logAudit } from "../../audit";

// ─── Wäsche: Bestand im Keller, Reserve, Bestellmenge ─────────────────────────
// Bestellt wird auf der Website der Wäscherei — diese Tools rechnen und halten fest.

function liste(q: LaundryQuantity) {
  return Object.fromEntries(LAUNDRY_ITEMS.map((i) => [i.label, q[i.key]]));
}

/** Eingabe: Mengen mit deutschen Namen */
const mengen = z
  .object({
    spannbettlaken: z.number().int().min(0).max(999).optional().describe("Spannbettlaken 180 × 200"),
    spannbettlaken_90: z.number().int().min(0).max(999).optional().describe("Spannbettlaken 90 × 200"),
    spannbettlaken_200: z.number().int().min(0).max(999).optional().describe("Spannbettlaken 200–220 × 200"),
    bettbezuege: z.number().int().min(0).max(999).optional(),
    kissenbezuege: z.number().int().min(0).max(999).optional(),
    handtuecher_gross: z.number().int().min(0).max(999).optional(),
    handtuecher_klein: z.number().int().min(0).max(999).optional(),
    waschlappen: z.number().int().min(0).max(999).optional(),
    badvorleger: z.number().int().min(0).max(999).optional(),
    kuechentuecher: z.number().int().min(0).max(999).optional(),
  })
  .strict();

const MAP: Record<keyof z.infer<typeof mengen>, keyof LaundryQuantity> = {
  spannbettlaken: "beds",
  spannbettlaken_90: "sheets90",
  spannbettlaken_200: "sheets200",
  bettbezuege: "duvetCovers",
  kissenbezuege: "pillowCases",
  handtuecher_gross: "towels",
  handtuecher_klein: "handTowels",
  waschlappen: "washcloths",
  badvorleger: "bathMats",
  kuechentuecher: "kitchen",
};

function toQuantity(m: z.infer<typeof mengen>, base: LaundryQuantity = emptyLaundryQuantity()): LaundryQuantity {
  const q = { ...base };
  for (const [k, v] of Object.entries(m)) if (v !== undefined) q[MAP[k as keyof typeof MAP]] = v;
  return q;
}

// ─── waesche_bedarf ───────────────────────────────────────────────────────────

export const waescheBedarf = defineTool({
  name: "waesche_bedarf",
  title: "Wäsche-Bestellmenge",
  description:
    "Rechnet aus, wie viel Wäsche bestellt werden muss, damit sie in den nächsten N Tagen (Vorgabe 14) nicht ausgeht: " +
    "Bedarf aller Anreisen + Reserve je Teil − Bestand im Keller (letzte Zählung, fortgeschrieben) − schon bestellte Lieferungen. " +
    "Je Anreise 1 Badvorleger, Küchentücher; je Gast Waschlappen, kleines und großes Handtuch, Kissen- und Bettbezug; je belegtem Bett ein Spannbettlaken in seiner Größe (90/180/200, siehe waesche_betten). " +
    "Für „Wie viel Wäsche müssen wir bestellen?“. Bestellt nicht selbst.",
  scope: "cleaning:read",
  input: {
    tage: z.number().int().min(1).max(60).optional().describe("Anzahl Tage ab heute (Vorgabe 14)"),
  },
  async handler(args, ctx) {
    const today = todayVienna();
    const tage = args.tage ?? 14;
    const r = await loadLaundryPlan({ organizationId: ctx.organizationId, today, days: tage });
    const p = r.plan;
    const nichts = LAUNDRY_ITEMS.every((i) => p.order[i.key] === 0);
    return {
      zeitraum: { von: day(today), bis: day(addDays(r.end, -1)) },
      anreisen: p.arrivals,
      gaeste: p.guests,
      bestellmenge: liste(p.order),
      bestellmenge_text: nichts ? "nichts zu bestellen — Bestand reicht inklusive Reserve" : laundryText(p.order),
      bedarf: liste(p.need),
      reserve: liste(p.reserve),
      bestand_heute: p.stockToday ? liste(p.stockToday) : null,
      bereits_bestellt: liste(p.incoming),
      bestand_danach: p.stockAfter ? liste(p.stockAfter) : null,
      ...(p.shortBeforeDelivery.length
        ? { achtung: `Vor der nächsten Lieferung reicht es nicht bei: ${p.shortBeforeDelivery.map((k) => LAUNDRY_ITEMS.find((i) => i.key === k)?.label).join(", ")}` }
        : {}),
      letzte_zaehlung: r.count ? day(r.count.countedOn) : null,
      ...(r.count ? {} : { hinweis_bestand: "Noch kein Bestand erfasst — Bestellmenge = Bedarf + Reserve. Bestand mit waesche_bestand_erfassen eintragen." }),
      je_wohnung: p.perApartment.map((a) => ({ wohnung: a.apartmentName, anreisen: a.arrivals, gaeste: a.guests, bedarf: laundryText(a.need) })),
      anreisen_liste: r.arrivalsInWindow.map((b) => ({ buchung_id: b.id, wohnung: b.apartment.name, gast: b.guestName, anreise: day(b.checkIn), personen: b.guestCount })),
      hinweis: "Gästezahlen aus Smoobu; bei Booking.com ggf. prüfen (gaestezahl_korrigieren). Nach der Bestellung waesche_lieferung_erfassen.",
    };
  },
});

// ─── waesche_bestand_erfassen ─────────────────────────────────────────────────

export const waescheBestandErfassen = defineTool({
  name: "waesche_bestand_erfassen",
  title: "Wäsche-Bestand erfassen",
  description:
    "Trägt den gezählten Bestand sauberer Wäsche im Keller ein (beide Wohnungen gemeinsam). Nicht genannte Teile zählen als 0. " +
    "Die Zählung gilt am Ende des Zähltags; danach rechnet die App Anreisen ab und Lieferungen dazu. Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    gezaehlt_am: datum.optional().describe("Tag der Zählung (Vorgabe heute)"),
    mengen,
    notiz: z.string().max(500).optional(),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const countedOn = args.gezaehlt_am ? parseDay(args.gezaehlt_am) : todayVienna();
    const q = toQuantity(args.mengen);
    if (!args.bestaetigt) return preview(`Bestand am ${day(countedOn)} eintragen: ${laundryText(q) || "alles 0"}.`, { bestand: liste(q) });
    await saveLaundryCount({ organizationId: ctx.organizationId, countedOn, quantities: q, notes: args.notiz ?? null, actor: { via: `mcp:${ctx.tokenName}` } });
    return { ausgefuehrt: true, gezaehlt_am: day(countedOn), bestand: liste(q) };
  },
});

// ─── waesche_lieferung_erfassen ───────────────────────────────────────────────

export const waescheLieferungErfassen = defineTool({
  name: "waesche_lieferung_erfassen",
  title: "Wäsche-Bestellung festhalten",
  description:
    "Hält eine bei der Wäscherei aufgegebene Bestellung mit Liefertag fest; ab dem Liefertag zählt sie zum Bestand. " +
    "Bestellt NICHT selbst. Ohne mengen wird die aktuelle Bestellmenge aus waesche_bedarf übernommen. Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    liefertag: datum.describe("Tag der Lieferung"),
    mengen: mengen.optional(),
    referenz: z.string().max(200).optional().describe("Bestellnummer o.ä."),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const deliveryOn = parseDay(args.liefertag);
    const q = args.mengen ? toQuantity(args.mengen) : (await loadLaundryPlan({ organizationId: ctx.organizationId, today: todayVienna(), days: 14 })).plan.order;
    if (!args.bestaetigt) return preview(`Lieferung am ${day(deliveryOn)} festhalten: ${laundryText(q) || "nichts"}.`, { mengen: liste(q) });
    await recordLaundryDelivery({ organizationId: ctx.organizationId, deliveryOn, quantities: q, reference: args.referenz ?? null, actor: { via: `mcp:${ctx.tokenName}` } });
    return { ausgefuehrt: true, liefertag: day(deliveryOn), mengen: liste(q) };
  },
});

// ─── waesche_reserve ──────────────────────────────────────────────────────────

export const waescheReserve = defineTool({
  name: "waesche_reserve",
  title: "Wäsche-Reserve je Teil",
  description:
    "Legt fest, wie viele Teile je Sorte nach allen Anreisen immer noch im Keller liegen sollen (Reserve gegen Runterfallen, Flecken, getrennte Betten). " +
    "Nicht genannte Teile bleiben unverändert. Erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: { mengen, bestaetigt: bestaetigtSchema },
  async handler(args, ctx) {
    const current = (await loadLaundryPlan({ organizationId: ctx.organizationId, today: todayVienna(), days: 1 })).plan.reserve;
    const q = toQuantity(args.mengen, current);
    if (!args.bestaetigt) return preview(`Reserve: ${laundryText(q)}.`, { vorher: liste(current), nachher: liste(q) });
    await setLaundryReserve({ organizationId: ctx.organizationId, reserve: q, actor: { via: `mcp:${ctx.tokenName}` } });
    return { ausgefuehrt: true, reserve: liste(q) };
  },
});

// ─── waesche_betten ───────────────────────────────────────────────────────────

const bett = z.object({
  breite: z.union([z.literal(90), z.literal(180), z.literal(200)]).describe("Spannbettlaken-Größe: 90 (bis 100 cm breit), 180, 200 (200–220)"),
  personen: z.number().int().min(1).max(4),
}).strict();

export const waescheBetten = defineTool({
  name: "waesche_betten",
  title: "Betten je Wohnung (Spannbettlaken-Größen)",
  description:
    "Legt die Betten einer Wohnung in Belegungsreihenfolge fest, damit die Wäsche-Rechnung Spannbettlaken in der richtigen Größe nimmt. " +
    "Beispiel Penthouse: [{breite:200,personen:2},{breite:180,personen:2},{breite:90,personen:1}] → 1–2 Gäste ein 200er, 3–4 zusätzlich ein 180er, 5 zusätzlich ein 90er. " +
    "Leere Liste = Vorgabe (ein 180er je 2 Gäste). Ohne betten nur anzeigen. Ändern erst ohne bestaetigt (Vorschau), dann mit bestaetigt: true.",
  scope: "cleaning:write",
  write: true,
  input: {
    wohnung: z.string().min(1).describe("Name oder ID der Wohnung"),
    betten: z.array(bett).max(8).optional(),
    bestaetigt: bestaetigtSchema,
  },
  async handler(args, ctx) {
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);
    if (!apartmentId) throw new Error(`Wohnung „${args.wohnung}“ nicht gefunden`);
    const apt = await prisma.apartment.findFirstOrThrow({ where: { id: apartmentId, organizationId: ctx.organizationId }, select: { id: true, name: true, laundryBeds: true, laundryBedsDivisor: true } });
    const anzeigen = (beds: unknown) => {
      const p = parseLaundryBeds(beds);
      return p ? p.map((b) => ({ breite: b.width, personen: b.persons })) : "Vorgabe: ein 180er je " + apt.laundryBedsDivisor + " Gäste";
    };
    const beispiel = (beds: unknown) =>
      Object.fromEntries([1, 2, 3, 4, 5].map((g) => [`${g} Gäste`, laundryText({ ...emptyLaundryQuantity(), ...pick(calculateLaundryQuantity(g, { laundryBeds: beds, laundryBedsDivisor: apt.laundryBedsDivisor })) }) || "–"]));
    if (!args.betten) return { wohnung: apt.name, betten: anzeigen(apt.laundryBeds), spannbettlaken: beispiel(apt.laundryBeds) };
    const neu = args.betten.map((b) => ({ width: b.breite, persons: b.personen }));
    if (!args.bestaetigt) return preview(`Betten für ${apt.name}: ${neu.length ? neu.map((b) => `${b.width}er (${b.persons} P.)`).join(", ") : "Vorgabe"}.`, { vorher: anzeigen(apt.laundryBeds), nachher: anzeigen(neu), spannbettlaken: beispiel(neu) });
    await prisma.apartment.update({ where: { id: apt.id }, data: { laundryBeds: neu.length ? neu : Prisma.DbNull } });
    await logAudit({ organizationId: ctx.organizationId, action: "apartment.laundry_beds", entityType: "Apartment", entityId: apt.id, details: { beds: neu, via: `mcp:${ctx.tokenName}` } });
    return { ausgefuehrt: true, wohnung: apt.name, betten: anzeigen(neu) };
  },
});

/** nur die Spannbettlaken einer Menge */
function pick(q: LaundryQuantity): Partial<LaundryQuantity> {
  return { beds: q.beds, sheets90: q.sheets90, sheets200: q.sheets200 };
}
