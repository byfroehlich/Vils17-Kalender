import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { viennaDateKey } from "./notifications";

// ─── Website-Besuchermessung (vils17.at) ──────────────────────────────────────
// Entscheidung Mathias 06.11.2026: messen, woher Besucher kommen, wie lange sie
// bleiben, was sie anschauen und ob sie buchen wollen — ohne Cookie-Banner.
// Deshalb (DSGVO + § 165 Abs. 3 TKG 2021):
//  - auf dem Gerät wird NICHTS gespeichert (keine Cookies, kein localStorage),
//  - Besucher-Kennung wie bei Plausible: sha256(Tagessalz + IP + User-Agent);
//    das Salz ist zufällig, gilt nur für einen Kalendertag und wird danach gelöscht,
//  - IP und vollständiger User-Agent werden NIE gespeichert oder protokolliert,
//  - Do-Not-Track / Global Privacy Control → nichts erfassen,
//  - Bots werden verworfen, Rohdaten nach 13 Monaten gelöscht.

/** Herkunftsseiten, die Messdaten senden dürfen (CORS). */
export const ALLOWED_ORIGINS = ["https://vils17.at", "https://www.vils17.at"] as const;

/** Smoobu-Wohnungs-IDs der Buchungsmaske → Wohnung */
export const SMOOBU_APARTMENTS: Record<string, "penthouse" | "lodge"> = {
  "2943886": "penthouse",
  "3443356": "lodge",
};

/** Größte angenommene Anfrage (Bytes). */
export const MAX_BODY_BYTES = 4096;

/** Begrenzung je IP: so viele Meldungen im Zeitfenster (Seitenaufruf + Ereignisse + Verweildauer). */
export const RATE_LIMIT = 240;
export const RATE_WINDOW_MS = 10 * 60_000;

/** Aufbewahrung der Rohdaten in Monaten. */
export const RETENTION_MONTHS = 13;

/** Längste plausible aktive Zeit je Seitenaufruf (darüber wird gekappt). */
export const MAX_DURATION_MS = 4 * 60 * 60_000;

// ─── Eingabe ──────────────────────────────────────────────────────────────────

const pageId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const shortToken = z.string().trim().max(80);

export const EVENT_TYPES = ["buchen_klick", "buchungsmaske", "abschnitt", "kontakt", "stammgast"] as const;
export type WebsiteEventType = (typeof EVENT_TYPES)[number];

/** Ereignisse, die je Seitenaufruf (und Ziel) nur einmal zählen */
const ONCE_PER_PAGE: readonly WebsiteEventType[] = ["buchungsmaske", "abschnitt", "stammgast"];

export const KONTAKT_WEGE = ["telefon", "mail", "whatsapp"] as const;

export const beaconSchema = z.discriminatedUnion("t", [
  // Seitenaufruf
  z.object({
    t: z.literal("pv"),
    pid: pageId,
    p: z.string().max(300),
    r: z.string().max(1000).optional(),
    l: z.string().max(40).optional(),
    us: shortToken.optional(),
    um: shortToken.optional(),
    uc: shortToken.optional(),
  }),
  // Verweildauer + Scrolltiefe (kumuliert; der größte Wert gilt)
  z.object({
    t: z.literal("eng"),
    pid: pageId,
    d: z.number().int().min(0).max(24 * 60 * 60_000),
    s: z.number().int().min(0).max(100),
  }),
  // Ereignis
  z.object({
    t: z.literal("ev"),
    pid: pageId,
    n: z.enum(EVENT_TYPES),
    v: z.string().trim().max(40).regex(/^[a-z0-9_-]*$/).optional(),
  }),
]);

export type Beacon = z.infer<typeof beaconSchema>;

// ─── Bots, Do-Not-Track, Gerät, Land ─────────────────────────────────────────

const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|scrap|archiver|facebookexternalhit|embedly|whatsapp\/|telegrambot|skypeuripreview|preview|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|python|curl\/|wget|httpclient|okhttp|go-http|java\/|axios|node-fetch|libwww|feedfetcher|validator|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|perplexity|ccbot|amazonbot|applebot|yandex|baiduspider|duckduckbot|bingpreview/i;

/** true = kein echter Browser (oder kein User-Agent) → verwerfen */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20) return true;
  return BOT_UA.test(ua);
}

/** Do-Not-Track oder Global Privacy Control gesetzt → nichts erfassen */
export function optedOut(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}

export function deviceType(ua: string): "mobil" | "tablet" | "desktop" {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobil";
  return "desktop";
}

/** Land aus einem Proxy-Header (Cloudflare, Vercel …); Render liefert keinen → null */
export function countryFrom(headers: Headers): string | null {
  const raw = headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? headers.get("x-country-code");
  const c = raw?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

/** "de-AT" → "de"; Unbrauchbares → null */
export function normalizeLanguage(l: string | undefined): string | null {
  const m = l?.trim().match(/^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*$/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** Pfad ohne Abfrage/Anker, ohne index.html, klein geschrieben */
export function normalizePath(p: string): string | null {
  const path = p.split(/[?#]/)[0]?.trim().toLowerCase() ?? "";
  if (!path.startsWith("/") || path.length > 200 || !/^[a-z0-9/._~%-]*$/.test(path)) return null;
  return path.replace(/\/index\.html?$/, "/") || "/";
}

const OWN_HOSTS = new Set(["vils17.at", "www.vils17.at"]);

/**
 * Referrer → nur die Domain, vereinheitlicht. Volle Adresse wird nie gespeichert.
 * null = direkt (kein Referrer), "intern" = Wechsel innerhalb von vils17.at.
 */
export function referrerSource(ref: string | undefined): string | null {
  if (!ref) return null;
  let host: string;
  try {
    const u = new URL(ref);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (OWN_HOSTS.has(host)) return "intern";
  if (host.endsWith(".onrender.com")) return "intern";
  host = host.replace(/^(www|m|l|lm|mobile|out)\./, "");
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (/(^|\.)bing\.com$/.test(host)) return "bing";
  if (/(^|\.)airbnb\.[a-z.]+$/.test(host)) return "airbnb";
  if (/(^|\.)booking\.com$/.test(host)) return host.startsWith("booking.smoobu") ? "smoobu" : "booking.com";
  if (/(^|\.)smoobu\.com$/.test(host)) return "smoobu";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.me)$/.test(host)) return "facebook";
  if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return "x";
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(host)) return "chatgpt";
  if (/(^|\.)(android-app|com\.google\.android)/.test(host)) return "google";
  return host.slice(0, 80);
}

/** utm-Werte: klein, ohne Sonderzeichen, gekürzt */
export function cleanUtm(v: string | undefined): string | null {
  const s = v?.trim().toLowerCase().replace(/[^a-z0-9._ -]/g, "").replace(/\s+/g, "-").slice(0, 60);
  return s ? s : null;
}

// ─── Tagessalz und Besucher-Kennung ──────────────────────────────────────────

const saltCache = new Map<string, string>();

/**
 * Zufälliges Salz für den heutigen Kalendertag (Wien). Liegt in der DB, damit
 * ein Neustart mitten am Tag die Kennungen nicht ändert. Ältere Salze werden
 * dabei gelöscht — danach lässt sich kein Hash mehr einer IP zuordnen.
 */
export async function dailySalt(organizationId: string, now = new Date()): Promise<string> {
  const day = viennaDateKey(now);
  const key = `${organizationId}:${day}`;
  const cached = saltCache.get(key);
  if (cached) return cached;

  const row = await prisma.websiteSalt.upsert({
    where: { organizationId_day: { organizationId, day } },
    create: { organizationId, day, salt: randomBytes(32).toString("base64url") },
    update: {},
    select: { salt: true },
  });
  await prisma.websiteSalt.deleteMany({ where: { organizationId, day: { not: day } } });
  saltCache.clear(); // alte Tage auch aus dem Speicher
  saltCache.set(key, row.salt);
  return row.salt;
}

export function resetSaltCache() {
  saltCache.clear();
}

/** sha256(Tagessalz + IP + User-Agent) — die einzige Spur von IP und UA */
export function visitorHash(salt: string, ip: string, ua: string, organizationId: string): string {
  return createHash("sha256").update(`${salt}|${organizationId}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/** Kalendertag in Wien als UTC-Mitternacht (Speicherformat wie bei Buchungen) */
export function viennaDay(now = new Date()): Date {
  return new Date(`${viennaDateKey(now)}T00:00:00.000Z`);
}

// ─── Begrenzung je IP (im Speicher, je Instanz) ───────────────────────────────

const hits = new Map<string, number[]>();

/** true = erlaubt. Zählt die Meldung mit. Die IP bleibt nur im Arbeitsspeicher. */
export function allowBeacon(ip: string, now = Date.now()): boolean {
  if (hits.size > 10_000) {
    hits.forEach((v, k) => {
      const last = v[v.length - 1];
      if (last === undefined || now - last >= RATE_WINDOW_MS) hits.delete(k);
    });
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function resetBeaconLimit() {
  hits.clear();
}

// ─── Speichern ────────────────────────────────────────────────────────────────

export interface BeaconContext {
  organizationId: string;
  ip: string;
  ua: string;
  headers: Headers;
  now?: Date;
}

/** Ergebnis für Tests/Diagnose — nie mit Personendaten */
export type RecordResult = "gespeichert" | "aktualisiert" | "ignoriert";

export async function recordBeacon(beacon: Beacon, ctx: BeaconContext): Promise<RecordResult> {
  const now = ctx.now ?? new Date();
  const { organizationId } = ctx;

  if (beacon.t === "pv") {
    const path = normalizePath(beacon.p);
    if (!path) return "ignoriert";
    const salt = await dailySalt(organizationId, now);
    const hash = visitorHash(salt, ctx.ip, ctx.ua, organizationId);
    const created = await prisma.websiteVisit.createMany({
      data: [
        {
          organizationId,
          pageId: beacon.pid,
          visitorHash: hash,
          day: viennaDay(now),
          path,
          referrer: referrerSource(beacon.r),
          utmSource: cleanUtm(beacon.us),
          utmMedium: cleanUtm(beacon.um),
          utmCampaign: cleanUtm(beacon.uc),
          language: normalizeLanguage(beacon.l),
          device: deviceType(ctx.ua),
          country: countryFrom(ctx.headers),
          createdAt: now,
        },
      ],
      skipDuplicates: true,
    });
    return created.count ? "gespeichert" : "ignoriert";
  }

  // Verweildauer und Ereignisse gehören zu einem Seitenaufruf der letzten 24 h
  const visit = await prisma.websiteVisit.findUnique({
    where: { organizationId_pageId: { organizationId, pageId: beacon.pid } },
    select: { id: true, visitorHash: true, day: true, durationMs: true, scrollDepth: true, createdAt: true },
  });
  if (!visit || now.getTime() - visit.createdAt.getTime() > 24 * 60 * 60_000) return "ignoriert";

  if (beacon.t === "eng") {
    const durationMs = Math.max(visit.durationMs, Math.min(beacon.d, MAX_DURATION_MS));
    const scrollDepth = Math.max(visit.scrollDepth, beacon.s);
    if (durationMs === visit.durationMs && scrollDepth === visit.scrollDepth) return "ignoriert";
    await prisma.websiteVisit.update({ where: { id: visit.id }, data: { durationMs, scrollDepth } });
    return "aktualisiert";
  }

  const target = eventTarget(beacon.n, beacon.v);
  if (target === undefined) return "ignoriert";
  const dedupeKey = ONCE_PER_PAGE.includes(beacon.n) ? `${beacon.pid}:${beacon.n}:${target ?? ""}` : null;
  const created = await prisma.websiteEvent.createMany({
    data: [
      {
        organizationId,
        visitId: visit.id,
        visitorHash: visit.visitorHash,
        day: visit.day,
        type: beacon.n,
        target,
        dedupeKey,
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });
  return created.count ? "gespeichert" : "ignoriert";
}

/** Ziel eines Ereignisses prüfen. undefined = ungültig → verwerfen */
function eventTarget(type: WebsiteEventType, v: string | undefined): string | null | undefined {
  switch (type) {
    case "buchen_klick":
    case "buchungsmaske":
      if (!v) return "unbekannt";
      return SMOOBU_APARTMENTS[v] ?? (v === "penthouse" || v === "lodge" ? v : "unbekannt");
    case "abschnitt":
      return v && /^[a-z0-9_-]{2,40}$/.test(v) ? v : undefined;
    case "kontakt":
      return v && (KONTAKT_WEGE as readonly string[]).includes(v) ? v : undefined;
    case "stammgast":
      return null;
  }
}

// ─── Aufräumen ────────────────────────────────────────────────────────────────

/** Grenze: alles, was vor diesem Zeitpunkt erfasst wurde, wird gelöscht */
export function retentionCutoff(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d;
}

/**
 * Löscht Rohdaten älter als 13 Monate und Salze vergangener Tage. Idempotent,
 * läuft im App-Takt.
 */
export async function cleanupWebsiteData(organizationId: string, now = new Date()) {
  const cutoff = retentionCutoff(now);
  const events = await prisma.websiteEvent.deleteMany({ where: { organizationId, createdAt: { lt: cutoff } } });
  const visits = await prisma.websiteVisit.deleteMany({ where: { organizationId, createdAt: { lt: cutoff } } });
  await prisma.websiteSalt.deleteMany({ where: { organizationId, day: { not: viennaDateKey(now) } } });
  return { visits: visits.count, events: events.count };
}
