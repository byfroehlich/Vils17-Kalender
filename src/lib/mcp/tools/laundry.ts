import { z } from "zod";
import { defineTool } from "../tool";
import { day, addDays, todayVienna } from "../format";
import { datum, wohnungFilter, resolveApartmentId } from "../shared";
import { BUFFER_PERCENT } from "../../laundry-order";
import { loadLaundryProposal } from "../../laundry-proposal";
import { LAUNDRY_ITEMS, laundryText, type LaundryQuantity } from "../../laundry-quantity";

// ─── waesche_bedarf ───────────────────────────────────────────────────────────
// Bestellvorschlag für die Wäscherei: Bedarf aller Anreisen im Zeitraum + Puffer.
// Bestellt wird auf der Website der Wäscherei — dieses Tool rechnet nur.

function liste(q: LaundryQuantity) {
  return Object.fromEntries(LAUNDRY_ITEMS.map((i) => [i.label, q[i.key]]));
}

export const waescheBedarf = defineTool({
  name: "waesche_bedarf",
  title: "Wäsche-Bestellmenge",
  description:
    "Rechnet aus, wie viel Wäsche für die Anreisen der nächsten N Tage (Vorgabe 14) bestellt werden muss: je Anreise 1 Badvorleger, 1 Waschlappen, Küchentücher; " +
    "je Gast kleines und großes Handtuch, Kissen- und Bettbezug; je 2 Gäste ein Spannbettlaken. Dazu Puffer: +1 Spannbettlaken je Wohnung " +
    `(zwei Gäste in getrennten Betten), sonst +${BUFFER_PERCENT} % aufgerundet. Für „Wie viel Wäsche müssen wir bestellen?“. Bestellt nicht selbst.`,
  scope: "cleaning:read",
  input: {
    von: datum.optional().describe("Erster Anreisetag (Vorgabe heute)"),
    tage: z.number().int().min(1).max(60).optional().describe("Anzahl Tage (Vorgabe 14)"),
    wohnung: wohnungFilter,
  },
  async handler(args, ctx) {
    const start = args.von ? new Date(`${args.von}T00:00:00.000Z`) : todayVienna();
    const tage = args.tage ?? 14;
    const end = addDays(start, tage);
    const apartmentId = await resolveApartmentId(ctx.organizationId, args.wohnung);

    const { rows, proposal: p } = await loadLaundryProposal({ organizationId: ctx.organizationId, start, days: tage, apartmentId });

    return {
      zeitraum: { von: day(start), bis: day(addDays(end, -1)) },
      anreisen: p.arrivals,
      gaeste: p.guests,
      bestellmenge: liste(p.order),
      bestellmenge_text: p.arrivals ? laundryText(p.order) : "keine Anreisen im Zeitraum — nichts zu bestellen",
      bedarf_ohne_puffer: liste(p.need),
      puffer: liste(p.buffer),
      je_wohnung: p.perApartment.map((a) => ({ wohnung: a.apartmentName, anreisen: a.arrivals, gaeste: a.guests, bedarf: laundryText(a.need) })),
      anreisen_liste: rows.map((b) => ({
        buchung_id: b.id, wohnung: b.apartment.name, gast: b.guestName, anreise: day(b.checkIn), personen: b.guestCount,
        waesche: b.cleaningAssignment?.laundryStatus === "ORDERED" ? "bestellt" : b.cleaningAssignment?.laundryStatus === "AVAILABLE" ? "vorhanden" : "offen",
      })),
      hinweis: "Gästezahlen aus Smoobu; bei Booking.com ggf. prüfen (gaestezahl_korrigieren). Bestellt wird auf der Website der Wäscherei, danach waesche_status „bestellt“ setzen.",
    };
  },
});
