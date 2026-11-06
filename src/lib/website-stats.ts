import { prisma } from "./prisma";
import { viennaDay } from "./website-analytics";

// ─── Auswertung der Website-Besuchermessung ──────────────────────────────────
// Ein „Besuch“ = ein Besucher (Tages-Kennung) an einem Kalendertag. Weil die
// Kennung jeden Tag wechselt, zählt jemand, der an zwei Tagen kommt, zweimal —
// genau wie bei Plausible. Gemeinsam genutzt von Seite „Website“ und MCP.

export const STATS_PERIODS = [7, 30, 90] as const;

export interface CountRow {
  key: string;
  besuche: number;
}

export interface PageRow {
  path: string;
  aufrufe: number;
  besucher: number;
  mittlereVerweildauerSek: number;
  mittlereScrolltiefe: number;
}

export interface DayRow {
  tag: string; // YYYY-MM-DD
  besucher: number;
  seitenaufrufe: number;
  buchungsklicks: number;
}

export interface FunnelStep {
  schritt: string;
  besuche: number;
  anteil: number; // 0–100, bezogen auf alle Besuche
}

export interface WebsiteStats {
  tage: number;
  von: string;
  bis: string;
  besucher: number;
  seitenaufrufe: number;
  seitenJeBesuch: number;
  mittlereVerweildauerSek: number;
  mittlereScrolltiefe: number;
  herkunft: CountRow[];
  kampagnen: CountRow[];
  seiten: PageRow[];
  geraete: CountRow[];
  laender: CountRow[];
  sprachen: CountRow[];
  abschnitte: CountRow[];
  buchungsklicks: { wohnung: string; klicks: number; besuche: number; maskeBenutzt: number }[];
  kontakt: CountRow[];
  stammgastEintragungen: number;
  trichter: FunnelStep[];
  verlauf: DayRow[];
}

export const WOHNUNG_LABEL: Record<string, string> = {
  penthouse: "Penthouse No. 17",
  lodge: "Lodge No. 17",
  unbekannt: "ohne Wohnung",
};

export const ABSCHNITT_LABEL: Record<string, string> = {
  galerie: "Bildergalerie",
  ausstattung: "Ausstattung / Das Wichtigste",
  buchungsmaske: "Buchungsmaske",
  "penthouse-karte": "Penthouse-Karte (Startseite)",
  "lodge-karte": "Lodge-Karte (Startseite)",
  einleitung: "Einleitung",
  buchungsleiste: "Freie Termine prüfen",
  vorteile: "Vorteile Direktbuchung",
};

const APARTMENT_PATHS = ["/penthouse", "/lodge"];

function sortCounts(m: Map<string, number>, limit = 20): CountRow[] {
  return Array.from(m.entries())
    .map(([key, besuche]) => ({ key, besuche }))
    .sort((a, b) => b.besuche - a.besuche || a.key.localeCompare(b.key))
    .slice(0, limit);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

/** Zeitraum: die letzten `tage` Kalendertage (Wien) inklusive heute */
export function statsRange(tage: number, now = new Date()) {
  const bis = viennaDay(now);
  const von = new Date(bis);
  von.setUTCDate(von.getUTCDate() - (tage - 1));
  return { von, bis };
}

export async function loadWebsiteStats(organizationId: string, tage: number, now = new Date()): Promise<WebsiteStats> {
  const days = Math.max(1, Math.min(400, Math.floor(tage)));
  const { von, bis } = statsRange(days, now);

  const [visits, events] = await Promise.all([
    prisma.websiteVisit.findMany({
      where: { organizationId, day: { gte: von, lte: bis } },
      select: {
        id: true, visitorHash: true, day: true, path: true, referrer: true, utmSource: true, utmCampaign: true,
        language: true, device: true, country: true, durationMs: true, scrollDepth: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.websiteEvent.findMany({
      where: { organizationId, day: { gte: von, lte: bis } },
      select: { visitorHash: true, day: true, type: true, target: true },
    }),
  ]);

  const visitKey = (v: { visitorHash: string; day: Date }) => `${v.day.toISOString().slice(0, 10)}|${v.visitorHash}`;

  // ── Besuche (Besucher je Tag) ──
  interface Besuch {
    first: (typeof visits)[number];
    durationMs: number;
    apartmentPage: boolean;
  }
  const besuche = new Map<string, Besuch>();
  for (const v of visits) {
    const k = visitKey(v);
    const b = besuche.get(k);
    const onApartment = APARTMENT_PATHS.some((p) => v.path.startsWith(p));
    if (!b) besuche.set(k, { first: v, durationMs: v.durationMs, apartmentPage: onApartment });
    else {
      b.durationMs += v.durationMs;
      b.apartmentPage ||= onApartment;
    }
  }
  const besucher = besuche.size;

  const herkunft = new Map<string, number>();
  const kampagnen = new Map<string, number>();
  const geraete = new Map<string, number>();
  const laender = new Map<string, number>();
  const sprachen = new Map<string, number>();
  let durSum = 0;
  let durCount = 0;
  besuche.forEach((b) => {
    const f = b.first;
    const src = f.utmSource ?? (f.referrer && f.referrer !== "intern" ? f.referrer : "direkt");
    herkunft.set(src, (herkunft.get(src) ?? 0) + 1);
    if (f.utmCampaign) kampagnen.set(f.utmCampaign, (kampagnen.get(f.utmCampaign) ?? 0) + 1);
    geraete.set(f.device, (geraete.get(f.device) ?? 0) + 1);
    const land = f.country ?? "unbekannt";
    laender.set(land, (laender.get(land) ?? 0) + 1);
    const sprache = f.language ?? "unbekannt";
    sprachen.set(sprache, (sprachen.get(sprache) ?? 0) + 1);
    if (b.durationMs > 0) {
      durSum += b.durationMs;
      durCount++;
    }
  });

  // ── Seiten ──
  const pages = new Map<string, { aufrufe: number; besucher: Set<string>; dur: number; durN: number; scroll: number; scrollN: number }>();
  let scrollSum = 0;
  let scrollN = 0;
  for (const v of visits) {
    const p = pages.get(v.path) ?? { aufrufe: 0, besucher: new Set<string>(), dur: 0, durN: 0, scroll: 0, scrollN: 0 };
    p.aufrufe++;
    p.besucher.add(visitKey(v));
    if (v.durationMs > 0) {
      p.dur += v.durationMs;
      p.durN++;
      p.scroll += v.scrollDepth;
      p.scrollN++;
      scrollSum += v.scrollDepth;
      scrollN++;
    }
    pages.set(v.path, p);
  }
  const seiten: PageRow[] = Array.from(pages.entries())
    .map(([path, p]) => ({
      path,
      aufrufe: p.aufrufe,
      besucher: p.besucher.size,
      mittlereVerweildauerSek: p.durN ? Math.round(p.dur / p.durN / 1000) : 0,
      mittlereScrolltiefe: p.scrollN ? Math.round(p.scroll / p.scrollN) : 0,
    }))
    .sort((a, b) => b.aufrufe - a.aufrufe || a.path.localeCompare(b.path))
    .slice(0, 30);

  // ── Ereignisse je Besuch ──
  const abschnitte = new Map<string, Set<string>>();
  const klicks = new Map<string, { klicks: number; besuche: Set<string>; maske: Set<string> }>();
  const kontakt = new Map<string, number>();
  let stammgast = 0;
  const sawMask = new Set<string>();
  const startedBooking = new Set<string>();
  const klicksJeTag = new Map<string, number>();
  for (const e of events) {
    const k = visitKey(e);
    const target = e.target ?? "";
    switch (e.type) {
      case "abschnitt": {
        const s = abschnitte.get(target) ?? new Set<string>();
        s.add(k);
        abschnitte.set(target, s);
        if (target === "buchungsmaske") sawMask.add(k);
        break;
      }
      case "buchen_klick":
      case "buchungsmaske": {
        const w = klicks.get(target) ?? { klicks: 0, besuche: new Set<string>(), maske: new Set<string>() };
        if (e.type === "buchen_klick") {
          w.klicks++;
          w.besuche.add(k);
          const tag = e.day.toISOString().slice(0, 10);
          klicksJeTag.set(tag, (klicksJeTag.get(tag) ?? 0) + 1);
        } else {
          w.maske.add(k);
        }
        klicks.set(target, w);
        startedBooking.add(k);
        break;
      }
      case "kontakt":
        kontakt.set(target, (kontakt.get(target) ?? 0) + 1);
        break;
      case "stammgast":
        stammgast++;
        break;
    }
  }

  // ── Trichter (jede Stufe setzt die vorige voraus) ──
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  besuche.forEach((b, k) => {
    if (!b.apartmentPage) return;
    s2++;
    if (!sawMask.has(k)) return;
    s3++;
    if (startedBooking.has(k)) s4++;
  });
  const trichter: FunnelStep[] = [
    { schritt: "Besuch", besuche: besucher, anteil: besucher ? 100 : 0 },
    { schritt: "Wohnungsseite angesehen", besuche: s2, anteil: pct(s2, besucher) },
    { schritt: "Buchungsmaske gesehen", besuche: s3, anteil: pct(s3, besucher) },
    { schritt: "„Jetzt buchen“ geklickt / Maske benutzt", besuche: s4, anteil: pct(s4, besucher) },
  ];

  // ── Verlauf pro Tag (auch Tage ohne Besuch) ──
  const perDay = new Map<string, { besucher: Set<string>; seitenaufrufe: number }>();
  for (const v of visits) {
    const tag = v.day.toISOString().slice(0, 10);
    const d = perDay.get(tag) ?? { besucher: new Set<string>(), seitenaufrufe: 0 };
    d.besucher.add(v.visitorHash);
    d.seitenaufrufe++;
    perDay.set(tag, d);
  }
  const verlauf: DayRow[] = [];
  for (let d = new Date(von); d <= bis; d.setUTCDate(d.getUTCDate() + 1)) {
    const tag = d.toISOString().slice(0, 10);
    const row = perDay.get(tag);
    verlauf.push({ tag, besucher: row?.besucher.size ?? 0, seitenaufrufe: row?.seitenaufrufe ?? 0, buchungsklicks: klicksJeTag.get(tag) ?? 0 });
  }

  const order = ["penthouse", "lodge", "unbekannt"];
  const buchungsklicks = Array.from(klicks.entries())
    .map(([wohnung, w]) => ({ wohnung, klicks: w.klicks, besuche: w.besuche.size, maskeBenutzt: w.maske.size }))
    .sort((a, b) => order.indexOf(a.wohnung) - order.indexOf(b.wohnung));

  return {
    tage: days,
    von: von.toISOString().slice(0, 10),
    bis: bis.toISOString().slice(0, 10),
    besucher,
    seitenaufrufe: visits.length,
    seitenJeBesuch: besucher ? round1(visits.length / besucher) : 0,
    mittlereVerweildauerSek: durCount ? Math.round(durSum / durCount / 1000) : 0,
    mittlereScrolltiefe: scrollN ? Math.round(scrollSum / scrollN) : 0,
    herkunft: sortCounts(herkunft),
    kampagnen: sortCounts(kampagnen),
    seiten,
    geraete: sortCounts(geraete),
    laender: sortCounts(laender),
    sprachen: sortCounts(sprachen),
    abschnitte: sortCounts(new Map(Array.from(abschnitte.entries()).map(([k, s]) => [k, s.size]))),
    buchungsklicks,
    kontakt: sortCounts(kontakt),
    stammgastEintragungen: stammgast,
    trichter,
    verlauf,
  };
}

/** Sekunden → "1:05 min" bzw. "42 s" */
export function formatDuration(sek: number): string {
  if (sek < 60) return `${sek} s`;
  const m = Math.floor(sek / 60);
  const s = sek % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}
