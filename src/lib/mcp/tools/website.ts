import { z } from "zod";
import { defineTool } from "../tool";
import { loadWebsiteStats, ABSCHNITT_LABEL, WOHNUNG_LABEL } from "../../website-stats";

// ─── Website-Statistik vils17.at (nur lesen) ─────────────────────────────────
// Scope bookings:read: Die Kennzahlen gehören fachlich zur Buchung (Wie finden
// Gäste zur Direktbuchung, wer klickt „Jetzt buchen“?), enthalten keine Geldbeträge
// (also nicht finance:read) und keine Personendaten oder Nachrichten (also nicht
// messages:read) — nur zusammengezählte Werte ohne Rückschluss auf einzelne Besucher.

export const websiteStatistik = defineTool({
  name: "website_statistik",
  title: "Website-Statistik vils17.at",
  description:
    "Besucherzahlen der Direktbuchungs-Website vils17.at (cookielose Messung): Besucher, Seitenaufrufe, mittlere Verweildauer, " +
    "Herkunft (Referrer/utm), Seiten, Geräte, Länder, Sprachen, gesehene Abschnitte, Buchungsklicks je Wohnung, Kontaktklicks, " +
    "Trichter Besuch → Wohnungsseite → Buchungsmaske gesehen → „Jetzt buchen“ und Verlauf pro Tag. " +
    "Ein Besuch = ein Besucher an einem Kalendertag (die Kennung wechselt täglich).",
  scope: "bookings:read",
  input: {
    tage: z.number().int().min(1).max(400).optional().describe("Zeitraum in Tagen bis einschließlich heute (Vorgabe 30; die App bietet 7/30/90)"),
  },
  async handler(args, ctx) {
    const s = await loadWebsiteStats(ctx.organizationId, args.tage ?? 30);
    return {
      zeitraum: { tage: s.tage, von: s.von, bis: s.bis },
      besucher: s.besucher,
      seitenaufrufe: s.seitenaufrufe,
      seiten_je_besuch: s.seitenJeBesuch,
      mittlere_verweildauer_sek: s.mittlereVerweildauerSek,
      mittlere_scrolltiefe_prozent: s.mittlereScrolltiefe,
      herkunft: s.herkunft.map((r) => ({ quelle: r.key, besuche: r.besuche })),
      kampagnen: s.kampagnen.map((r) => ({ kampagne: r.key, besuche: r.besuche })),
      seiten: s.seiten.map((p) => ({
        pfad: p.path, aufrufe: p.aufrufe, besucher: p.besucher,
        mittlere_verweildauer_sek: p.mittlereVerweildauerSek, mittlere_scrolltiefe_prozent: p.mittlereScrolltiefe,
      })),
      geraete: s.geraete.map((r) => ({ geraet: r.key, besuche: r.besuche })),
      laender: s.laender.map((r) => ({ land: r.key, besuche: r.besuche })),
      sprachen: s.sprachen.map((r) => ({ sprache: r.key, besuche: r.besuche })),
      abschnitte: s.abschnitte.map((r) => ({ abschnitt: r.key, bezeichnung: ABSCHNITT_LABEL[r.key] ?? r.key, besuche: r.besuche })),
      buchungsklicks: s.buchungsklicks.map((b) => ({
        wohnung: WOHNUNG_LABEL[b.wohnung] ?? b.wohnung, klicks: b.klicks, besuche_mit_klick: b.besuche, besuche_maske_benutzt: b.maskeBenutzt,
      })),
      kontaktklicks: s.kontakt.map((r) => ({ weg: r.key, klicks: r.besuche })),
      stammgast_eintragungen: s.stammgastEintragungen,
      trichter: s.trichter.map((t) => ({ schritt: t.schritt, besuche: t.besuche, anteil_prozent: t.anteil })),
      verlauf: s.verlauf,
      hinweis: "Länder sind nur bekannt, wenn ein vorgeschalteter Dienst (z. B. Cloudflare) sie mitliefert; sonst „unbekannt“.",
    };
  },
});
