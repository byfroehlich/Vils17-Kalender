import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST, OPTIONS } from "@/app/api/public/besuch/route";
import {
  RATE_LIMIT,
  cleanupWebsiteData,
  dailySalt,
  deviceType,
  isBot,
  recordBeacon,
  referrerSource,
  resetBeaconLimit,
  resetSaltCache,
  retentionCutoff,
  visitorHash,
} from "@/lib/website-analytics";
import { loadWebsiteStats } from "@/lib/website-stats";
import { runTakt, resetTaktState } from "@/lib/app-takt";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { resetDb, seedWorld } from "./fixtures";

vi.mock("@/lib/sync-runner", () => ({ runAutoSync: vi.fn(async () => ({ synced: true, lastSyncAt: new Date() })) }));
vi.mock("@/lib/dreame-runner", () => ({ runDreame: vi.fn(async () => []) }));

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IP = "203.0.113.77";

let world: Awaited<ReturnType<typeof seedWorld>>;
let n = 0;
const pid = () => `seite${String(++n).padStart(6, "0")}abc`;

function req(
  body: unknown,
  opts: { origin?: string | null; ip?: string; ua?: string; headers?: Record<string, string>; raw?: string } = {}
) {
  const origin = opts.origin === undefined ? "https://vils17.at" : opts.origin;
  return new NextRequest("http://localhost/api/public/besuch", {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "x-forwarded-for": opts.ip ?? IP,
      "user-agent": opts.ua ?? UA_IPHONE,
      ...(origin ? { origin } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.raw ?? JSON.stringify(body),
  });
}

beforeEach(async () => {
  resetBeaconLimit();
  resetSaltCache();
  resetTaktState();
  await resetDb();
  world = await seedWorld();
});

describe("POST /api/public/besuch", () => {
  it("speichert einen Seitenaufruf ohne IP und User-Agent, mit Herkunft nur als Domain", async () => {
    const p = pid();
    const res = await POST(
      req(
        { t: "pv", pid: p, p: "/penthouse/index.html?x=1", r: "https://www.google.com/search?q=vils+ferienwohnung", l: "de-AT", us: "Instagram", uc: "Sommer 2027" },
        { headers: { "cf-ipcountry": "de" } }
      )
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://vils17.at");

    const rows = await prisma.websiteVisit.findMany();
    expect(rows).toHaveLength(1);
    const v = rows[0]!;
    expect(v.organizationId).toBe(world.org.id);
    expect(v.path).toBe("/penthouse/");
    expect(v.referrer).toBe("google");
    expect(v.utmSource).toBe("instagram");
    expect(v.utmCampaign).toBe("sommer-2027");
    expect(v.language).toBe("de");
    expect(v.device).toBe("mobil");
    expect(v.country).toBe("DE");
    expect(v.visitorHash).toMatch(/^[0-9a-f]{32}$/);

    // Nirgends in den Messdaten: IP, User-Agent, volle Referrer-Adresse
    const dump = JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM website_visits`)) + JSON.stringify(await prisma.websiteSalt.findMany());
    expect(dump).not.toContain(IP);
    expect(dump).not.toContain("iPhone");
    expect(dump).not.toContain("Safari");
    expect(dump).not.toContain("q=vils");
    // Auch kein Audit-/Protokolleintrag mit Besucherdaten
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(IP);
  });

  it("CORS nur für vils17.at und www.vils17.at, OPTIONS beantwortet", async () => {
    const www = await POST(req({ t: "pv", pid: pid(), p: "/" }, { origin: "https://www.vils17.at" }));
    expect(www.status).toBe(204);
    expect(www.headers.get("access-control-allow-origin")).toBe("https://www.vils17.at");

    const evil = await POST(req({ t: "pv", pid: pid(), p: "/" }, { origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const none = await POST(req({ t: "pv", pid: pid(), p: "/" }, { origin: null }));
    expect(none.status).toBe(403);
    expect(await prisma.websiteVisit.count()).toBe(1);

    const pre = await OPTIONS(new NextRequest("http://localhost/api/public/besuch", {
      method: "OPTIONS", headers: { origin: "https://vils17.at", "access-control-request-method": "POST" },
    }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://vils17.at");
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");
    const preEvil = await OPTIONS(new NextRequest("http://localhost/api/public/besuch", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(preEvil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("Zod: ungültige Meldungen und zu große Rümpfe werden abgelehnt", async () => {
    expect((await POST(req({}, { raw: "kein json" }))).status).toBe(400);
    expect((await POST(req({ t: "pv", pid: "x", p: "/" }))).status).toBe(400); // pid zu kurz
    expect((await POST(req({ t: "ev", pid: pid(), n: "hack" }))).status).toBe(400);
    expect((await POST(req({ t: "eng", pid: pid(), d: -1, s: 50 }))).status).toBe(400);
    expect((await POST(req({ t: "pv", pid: pid(), p: "/" + "a".repeat(5000) }))).status).toBe(413);
    expect(await prisma.websiteVisit.count()).toBe(0);
  });

  it("Bots werden verworfen", async () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
      "curl/8.4.0",
      "",
    ]) {
      const res = await POST(req({ t: "pv", pid: pid(), p: "/" }, { ua }));
      expect(res.status).toBe(204);
    }
    expect(await prisma.websiteVisit.count()).toBe(0);
    expect(isBot(UA_DESKTOP)).toBe(false);
  });

  it("Do-Not-Track und Global Privacy Control: nichts erfassen", async () => {
    expect((await POST(req({ t: "pv", pid: pid(), p: "/" }, { headers: { dnt: "1" } }))).status).toBe(204);
    expect((await POST(req({ t: "pv", pid: pid(), p: "/" }, { headers: { "sec-gpc": "1" } }))).status).toBe(204);
    expect(await prisma.websiteVisit.count()).toBe(0);
    expect(await prisma.websiteSalt.count()).toBe(0);
  });

  it("Rate-Limit je IP", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      // ungültige Meldungen zählen mit, damit niemand das Limit umgeht
      await POST(req({ t: "x" }, { ip: "198.51.100.9" }));
    }
    const limited = await POST(req({ t: "pv", pid: pid(), p: "/" }, { ip: "198.51.100.9" }));
    expect(limited.status).toBe(429);
    const other = await POST(req({ t: "pv", pid: pid(), p: "/" }, { ip: "198.51.100.10" }));
    expect(other.status).toBe(204);
    expect(await prisma.websiteVisit.count()).toBe(1);
  });

  it("Verweildauer: größter Wert gilt, Ereignisse je Seitenaufruf nur einmal, Klicks mehrfach", async () => {
    const p = pid();
    await POST(req({ t: "pv", pid: p, p: "/lodge/" }));
    await POST(req({ t: "eng", pid: p, d: 42_000, s: 60 }));
    await POST(req({ t: "eng", pid: p, d: 30_000, s: 40 })); // älterer Stand → ignoriert
    const v = await prisma.websiteVisit.findFirstOrThrow();
    expect(v.durationMs).toBe(42_000);
    expect(v.scrollDepth).toBe(60);

    await POST(req({ t: "ev", pid: p, n: "abschnitt", v: "buchungsmaske" }));
    await POST(req({ t: "ev", pid: p, n: "abschnitt", v: "buchungsmaske" }));
    await POST(req({ t: "ev", pid: p, n: "buchungsmaske", v: "3443356" }));
    await POST(req({ t: "ev", pid: p, n: "buchen_klick", v: "3443356" }));
    await POST(req({ t: "ev", pid: p, n: "buchen_klick", v: "3443356" }));
    await POST(req({ t: "ev", pid: p, n: "kontakt", v: "fax" })); // unbekannter Kontaktweg → verworfen
    await POST(req({ t: "ev", pid: "unbekannt12345", n: "kontakt", v: "mail" })); // ohne Seitenaufruf → verworfen

    const events = await prisma.websiteEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(events.map((e) => `${e.type}:${e.target}`).sort()).toEqual([
      "abschnitt:buchungsmaske", "buchen_klick:lodge", "buchen_klick:lodge", "buchungsmaske:lodge",
    ]);
    expect(events.every((e) => e.organizationId === world.org.id && e.visitId === v.id)).toBe(true);
  });
});

describe("Besucher-Kennung", () => {
  it("gleich am selben Tag, anders am nächsten Tag; altes Salz wird gelöscht", async () => {
    const org = world.org.id;
    const d1 = new Date("2026-11-06T10:00:00+01:00");
    const d1spaet = new Date("2026-11-06T23:30:00+01:00");
    const d2 = new Date("2026-11-07T00:30:00+01:00");

    const s1 = await dailySalt(org, d1);
    const s1b = await dailySalt(org, d1spaet);
    expect(s1b).toBe(s1);
    resetSaltCache(); // Neustart mitten am Tag → gleiches Salz aus der DB
    expect(await dailySalt(org, d1)).toBe(s1);

    const s2 = await dailySalt(org, d2);
    expect(s2).not.toBe(s1);
    expect(visitorHash(s1, IP, UA_IPHONE, org)).not.toBe(visitorHash(s2, IP, UA_IPHONE, org));
    expect(visitorHash(s1, IP, UA_IPHONE, org)).toBe(visitorHash(s1, IP, UA_IPHONE, org));
    expect(visitorHash(s1, IP, UA_DESKTOP, org)).not.toBe(visitorHash(s1, IP, UA_IPHONE, org));

    const salts = await prisma.websiteSalt.findMany();
    expect(salts.map((s) => s.day)).toEqual(["2026-11-07"]);
  });

  it("derselbe Besucher: an einem Tag ein Besuch, am nächsten Tag ein neuer", async () => {
    const ctx = { organizationId: world.org.id, ip: IP, ua: UA_DESKTOP, headers: new Headers() };
    await recordBeacon({ t: "pv", pid: pid(), p: "/" }, { ...ctx, now: new Date("2026-11-06T09:00:00Z") });
    await recordBeacon({ t: "pv", pid: pid(), p: "/lodge/" }, { ...ctx, now: new Date("2026-11-06T09:05:00Z") });
    await recordBeacon({ t: "pv", pid: pid(), p: "/" }, { ...ctx, now: new Date("2026-11-07T09:00:00Z") });
    const v = await prisma.websiteVisit.findMany({ orderBy: { createdAt: "asc" } });
    expect(v[0]!.visitorHash).toBe(v[1]!.visitorHash);
    expect(v[2]!.visitorHash).not.toBe(v[0]!.visitorHash);
  });
});

describe("Hilfsfunktionen", () => {
  it("Herkunft und Gerät", () => {
    expect(referrerSource(undefined)).toBeNull();
    expect(referrerSource("https://vils17.at/penthouse/")).toBe("intern");
    expect(referrerSource("https://www.airbnb.at/rooms/123?foo=bar")).toBe("airbnb");
    expect(referrerSource("https://l.instagram.com/?u=x")).toBe("instagram");
    expect(referrerSource("https://www.google.de/")).toBe("google");
    expect(referrerSource("https://www.booking.com/hotel/at/x.html")).toBe("booking.com");
    expect(referrerSource("https://www.bergfex.at/vils/")).toBe("bergfex.at");
    expect(referrerSource("javascript:alert(1)")).toBeNull();
    expect(deviceType(UA_IPHONE)).toBe("mobil");
    expect(deviceType(UA_DESKTOP)).toBe("desktop");
    expect(deviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("tablet");
    expect(deviceType("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe("tablet");
  });
});

describe("Auswertung", () => {
  const NOW = new Date("2026-11-06T12:00:00Z");

  async function besuch(o: { ip: string; ua?: string; at: string; pages: string[]; ref?: string; events?: [string, string?][]; dauer?: number; country?: string }) {
    const ctx = { organizationId: world.org.id, ip: o.ip, ua: o.ua ?? UA_IPHONE, headers: new Headers(o.country ? { "cf-ipcountry": o.country } : {}), now: new Date(o.at) };
    let last = "";
    for (let i = 0; i < o.pages.length; i++) {
      const p = o.pages[i]!;
      last = pid();
      await recordBeacon({ t: "pv", pid: last, p, ...(i === 0 && o.ref ? { r: o.ref } : {}), l: "de-DE" }, ctx);
      if (o.dauer) await recordBeacon({ t: "eng", pid: last, d: o.dauer, s: 80 }, ctx);
    }
    for (const [name, v] of o.events ?? []) {
      await recordBeacon({ t: "ev", pid: last, n: name as "abschnitt", ...(v ? { v } : {}) }, ctx);
    }
  }

  it("Kennzahlen, Herkunft, Trichter und Verlauf", async () => {
    // A: Google → Penthouse, sieht Maske, klickt buchen
    await besuch({ ip: "10.1.0.1", at: "2026-11-05T10:00:00Z", ref: "https://www.google.com/", pages: ["/", "/penthouse/"], dauer: 60_000, country: "DE",
      events: [["abschnitt", "galerie"], ["abschnitt", "buchungsmaske"], ["buchungsmaske", "2943886"]] });
    // B: direkt → Lodge, sieht Maske, kein Klick
    await besuch({ ip: "10.1.0.2", ua: UA_DESKTOP, at: "2026-11-06T08:00:00Z", pages: ["/lodge/"], dauer: 30_000,
      events: [["abschnitt", "buchungsmaske"], ["kontakt", "telefon"]] });
    // C: Instagram → nur Startseite, klickt dort direkt „Jetzt buchen“ Lodge
    await besuch({ ip: "10.1.0.3", at: "2026-11-06T09:00:00Z", ref: "https://l.instagram.com/", pages: ["/"],
      events: [["buchen_klick", "3443356"], ["stammgast"]] });
    // D: außerhalb des Zeitraums (vor 10 Tagen)
    await besuch({ ip: "10.1.0.4", at: "2026-10-27T09:00:00Z", pages: ["/"] });
    // Andere Organisation: darf nicht mitzählen
    const other = await prisma.organization.create({ data: { name: "Andere", slug: "andere" } });
    await recordBeacon({ t: "pv", pid: pid(), p: "/" }, { organizationId: other.id, ip: "10.9.9.9", ua: UA_IPHONE, headers: new Headers(), now: new Date("2026-11-06T09:00:00Z") });

    const s = await loadWebsiteStats(world.org.id, 7, NOW);
    expect(s.von).toBe("2026-10-31");
    expect(s.bis).toBe("2026-11-06");
    expect(s.besucher).toBe(3);
    expect(s.seitenaufrufe).toBe(4);
    expect(s.seitenJeBesuch).toBe(1.3);
    // A: 2 × 60 s = 120 s, B: 30 s → (120 + 30) / 2 = 75 s
    expect(s.mittlereVerweildauerSek).toBe(75);
    expect(s.mittlereScrolltiefe).toBe(80);
    expect(s.herkunft).toEqual([
      { key: "direkt", besuche: 1 }, { key: "google", besuche: 1 }, { key: "instagram", besuche: 1 },
    ]);
    expect(s.geraete).toEqual([{ key: "mobil", besuche: 2 }, { key: "desktop", besuche: 1 }]);
    expect(s.laender).toEqual([{ key: "unbekannt", besuche: 2 }, { key: "DE", besuche: 1 }]);
    expect(s.sprachen).toEqual([{ key: "de", besuche: 3 }]);
    expect(s.seiten[0]).toMatchObject({ path: "/", aufrufe: 2, besucher: 2 });
    expect(s.abschnitte).toEqual([{ key: "buchungsmaske", besuche: 2 }, { key: "galerie", besuche: 1 }]);
    expect(s.buchungsklicks).toEqual([
      { wohnung: "penthouse", klicks: 0, besuche: 0, maskeBenutzt: 1 },
      { wohnung: "lodge", klicks: 1, besuche: 1, maskeBenutzt: 0 },
    ]);
    expect(s.kontakt).toEqual([{ key: "telefon", besuche: 1 }]);
    expect(s.stammgastEintragungen).toBe(1);
    expect(s.trichter.map((t) => [t.besuche, t.anteil])).toEqual([[3, 100], [2, 66.7], [2, 66.7], [1, 33.3]]);
    expect(s.verlauf).toHaveLength(7);
    expect(s.verlauf.at(-2)).toEqual({ tag: "2026-11-05", besucher: 1, seitenaufrufe: 2, buchungsklicks: 0 });
    expect(s.verlauf.at(-1)).toEqual({ tag: "2026-11-06", besucher: 2, seitenaufrufe: 2, buchungsklicks: 1 });

    const s30 = await loadWebsiteStats(world.org.id, 30, NOW);
    expect(s30.besucher).toBe(4);
  });

  it("MCP website_statistik liefert dieselben Kennzahlen (Scope bookings:read)", async () => {
    await besuch({ ip: "10.1.0.1", at: new Date().toISOString(), pages: ["/penthouse/"], events: [["buchen_klick", "2943886"]] });
    const tool = findTool("website_statistik")!;
    expect(tool.scope).toBe("bookings:read");
    const ctx: ToolContext = { organizationId: world.org.id, tokenId: "t", tokenName: "Test", scopes: ["bookings:read"] };
    const { ok, result } = await runTool(tool, { tage: 7 }, ctx);
    expect(ok).toBe(true);
    const r = result as { besucher: number; buchungsklicks: { wohnung: string; klicks: number }[]; trichter: unknown[]; zeitraum: { tage: number } };
    expect(r.zeitraum.tage).toBe(7);
    expect(r.besucher).toBe(1);
    expect(r.buchungsklicks).toEqual([expect.objectContaining({ wohnung: "Penthouse No. 17", klicks: 1 })]);
    expect(r.trichter).toHaveLength(4);

    const denied = await runTool(tool, {}, { ...ctx, scopes: ["messages:read"] });
    expect(denied.ok).toBe(false);
  });
});

describe("Aufräumen nach 13 Monaten", () => {
  it("löscht alte Rohdaten im App-Takt, neuere bleiben", async () => {
    const now = new Date("2026-11-06T12:00:00Z");
    expect(retentionCutoff(now).toISOString()).toBe("2025-10-06T12:00:00.000Z");
    const ctx = { organizationId: world.org.id, ip: IP, ua: UA_IPHONE, headers: new Headers() };
    const alt = pid();
    await recordBeacon({ t: "pv", pid: alt, p: "/" }, { ...ctx, now: new Date("2025-10-01T10:00:00Z") });
    await recordBeacon({ t: "ev", pid: alt, n: "kontakt", v: "mail" }, { ...ctx, now: new Date("2025-10-01T10:01:00Z") });
    const neu = pid();
    await recordBeacon({ t: "pv", pid: neu, p: "/lodge/" }, { ...ctx, now: new Date("2025-10-10T10:00:00Z") });
    await recordBeacon({ t: "ev", pid: neu, n: "kontakt", v: "mail" }, { ...ctx, now: new Date("2025-10-10T10:01:00Z") });

    await runTakt(now);
    expect((await prisma.websiteVisit.findMany()).map((v) => v.path)).toEqual(["/lodge/"]);
    expect(await prisma.websiteEvent.count()).toBe(1);
    expect(await prisma.websiteSalt.count()).toBe(0); // Salze vergangener Tage weg

    // idempotent
    expect(await cleanupWebsiteData(world.org.id, now)).toEqual({ visits: 0, events: 0 });
  });
});
