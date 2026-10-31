import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sent = vi.hoisted(() => ({ roles: [] as { roles: string[]; title: string }[] }));
vi.mock("@/lib/mail", () => ({ sendCleaningAssignmentMail: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => ({
  sendPushToUsers: vi.fn(async () => ({ notConfigured: false, devices: 1, sent: 1, failed: 0, removed: 0 })),
  sendPushToRole: vi.fn(async (_org: string, roles: string[], p: { title: string }) => { sent.roles.push({ roles, title: p.title }); }),
}));

import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool, TOOLS } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { hmacHeaders } from "@/lib/smoobu-auth";
import { lastMessage } from "@/lib/guest-messages";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;

async function call(name: string, args: Record<string, unknown> = {}, c: ToolContext = ctx) {
  return runTool(findTool(name)!, args, c) as Promise<{ ok: boolean; result: any }>;
}

type FetchCall = { url: string; method: string; headers: Record<string, string>; body?: string };
let calls: FetchCall[];
let replies: Record<string, () => Response>;

function smoobuPage(messages: unknown[], page_count = 1) {
  return new Response(JSON.stringify({ page_count, page_size: 25, total_items: messages.length, page: 1, messages }), { status: 200 });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
  // Smoobu-IDs für die Fixture-Buchungen
  await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 9002 } });
  await prisma.booking.update({ where: { id: world.bookings.b3.id }, data: { smoobuId: 9003 } });
  await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { smoobuId: 9005 } });
  ctx = { organizationId: world.org.id, tokenId: "tok1", tokenName: "Claude", scopes: [...SCOPES] };
  sent.roles = [];
  calls = [];
  replies = {};
  process.env.SMOOBU_API_KEY = "key-test";
  process.env.SMOOBU_API_SECRET = "secret-test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    const key = Object.keys(replies).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ title: "not found" }), { status: 404 });
    return replies[key]!();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Scopes und Registrierung", () => {
  it("neue Werkzeuge hängen an den richtigen Scopes; Senden ist ein Schreib-Tool", () => {
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
    expect(byName.gaeste_nachrichten?.scope).toBe("messages:read");
    expect(byName.offene_gaestenachrichten?.scope).toBe("messages:read");
    expect(byName.gast_antworten).toMatchObject({ scope: "messages:write", write: true });
    expect(byName.reinigung_status).toMatchObject({ scope: "cleaning:write", write: true });
    expect(byName.waesche_status).toMatchObject({ scope: "cleaning:write", write: true });
    expect(byName.wochenplan?.scope).toBe("cleaning:read");
  });

  it("ohne messages:read kein Zugriff auf den Chat", async () => {
    const r = await call("gaeste_nachrichten", { buchung_id: world.bookings.b2.id }, { ...ctx, scopes: ["bookings:read"] });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/messages:read/);
    expect(calls).toHaveLength(0);
  });
});

describe("gaeste_nachrichten", () => {
  it("liest den Chat signiert (HMAC) und erkennt, dass der Gast auf Antwort wartet", async () => {
    replies["/reservations/9002/messages"] = () =>
      smoobuPage([
        { id: 11, subject: "", message: "Hallo, wir freuen uns!", htmlMessage: "", type: 2 },
        { id: 12, subject: "Frage", message: "", messageHtml: "<p>Gibt es ein Kinderbett?</p>", type: 1 },
      ]);
    const r = await call("gaeste_nachrichten", { buchung_id: world.bookings.b2.id });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ gast: "Bernd Huber", wartet_auf_antwort: true, anzahl: 2 });
    expect(r.result.nachrichten[1]).toEqual({ id: "12", von: "gast", betreff: "Frage", text: "Gibt es ein Kinderbett?" });

    const c = calls[0]!;
    expect(c.method).toBe("GET");
    expect(new URL(c.url).searchParams.get("onlyRelatedToGuest")).toBe("true");
    expect(c.headers["X-API-Key"]).toBe("key-test");
    expect(c.headers["X-Signature"]).toBeTruthy();
    expect(c.headers["Api-Key"]).toBeUndefined();
  });

  it("Buchung ohne Smoobu-ID → verständlicher Fehler, kein Aufruf", async () => {
    const r = await call("gaeste_nachrichten", { buchung_id: world.bookings.b1.id });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/nicht aus Smoobu/);
    expect(calls).toHaveLength(0);
  });

  it("lastMessage ordnet nach numerischer ID, nicht nach Lieferreihenfolge", () => {
    const m = lastMessage([
      { id: "30", von: "gastgeber", betreff: null, text: "b" },
      { id: "4", von: "gast", betreff: null, text: "a" },
    ]);
    expect(m?.id).toBe("30");
  });
});

describe("offene_gaestenachrichten", () => {
  it("listet nur Buchungen, deren letzte Nachricht vom Gast kommt; Fehler je Buchung werden gemeldet", async () => {
    replies["/reservations/9002/messages"] = () => smoobuPage([{ id: 1, message: "Wann ist Check-in?", type: 1 }]);
    replies["/reservations/9003/messages"] = () => smoobuPage([{ id: 1, message: "Frage", type: 1 }, { id: 2, message: "Antwort", type: 2 }]);
    replies["/reservations/9005/messages"] = () => new Response("kaputt", { status: 500 });
    const r = await call("offene_gaestenachrichten", {});
    expect(r.ok).toBe(true);
    expect(r.result.geprueft).toBe(3);
    expect(r.result.buchungen.map((b: any) => b.gast)).toEqual(["Bernd Huber"]);
    expect(r.result.fehler).toEqual([expect.objectContaining({ gast: "Eva Klein", fehler: expect.stringMatching(/500/) })]);
  });
});

describe("gast_antworten", () => {
  it("ohne bestaetigt: Vorschau mit genauem Text, nichts gesendet", async () => {
    const r = await call("gast_antworten", { buchung_id: world.bookings.b2.id, text: "Ja, ein Kinderbett steht bereit." });
    expect(r.result).toMatchObject({ vorschau: true, ausgefuehrt: false, text: "Ja, ein Kinderbett steht bereit.", gast: "Bernd Huber" });
    expect(calls).toHaveLength(0);
  });

  it("mit bestaetigt: POST an send-message-to-guest, signiert über genau den gesendeten Rumpf; Audit ohne Text", async () => {
    replies["/send-message-to-guest"] = () => new Response(JSON.stringify({ status: 201, title: "Resource created successfully", detail: "" }), { status: 201 });
    const text = "Ja, ein Kinderbett steht bereit.\nViele Grüße";
    const r = await call("gast_antworten", { buchung_id: world.bookings.b2.id, text, bestaetigt: true });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ ausgefuehrt: true, gesendet: true });

    const c = calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url).toBe("https://login.smoobu.com/api/reservations/9002/messages/send-message-to-guest");
    expect(JSON.parse(c.body!)).toEqual({ messageBody: text });
    // Die Signatur muss über die tatsächlich gesendeten Bytes laufen
    const expected = hmacHeaders({
      method: "POST", url: new URL(c.url), body: c.body!, apiKey: "key-test", apiSecret: "secret-test",
      timestamp: c.headers["X-Timestamp"]!, nonce: c.headers["X-Nonce"]!,
    });
    expect(c.headers["X-Signature"]).toBe(expected["X-Signature"]);

    const logs = await prisma.auditLog.findMany({ where: { OR: [{ action: "mcp.gast_antworten" }, { action: "guest.message.sent" }] } });
    expect(JSON.stringify(logs)).not.toContain("Kinderbett");
    expect(logs.find((l) => l.action === "guest.message.sent")?.details).toMatchObject({ zeichen: text.length, via: "mcp:Claude" });
  });

  it("Smoobu lehnt ab → Fehler mit Status, kein „gesendet“", async () => {
    replies["/send-message-to-guest"] = () => new Response(JSON.stringify({ title: "Validation failed", detail: "messageBody: darf nicht leer sein" }), { status: 400 });
    const r = await call("gast_antworten", { buchung_id: world.bookings.b2.id, text: "x", bestaetigt: true });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/400/);
  });

  it("stornierte Buchung → keine Nachricht", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b6.id }, data: { smoobuId: 9006 } });
    const r = await call("gast_antworten", { buchung_id: world.bookings.b6.id, text: "Hallo", bestaetigt: true });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("reinigung_status", () => {
  it("erledigt: Vorschau, dann Satz festgeschrieben und Push an die Verwaltung", async () => {
    const id = world.bookings.b2.id; // Kerstin zugewiesen
    const v = await call("reinigung_status", { buchung_id: id, status: "erledigt" });
    expect(v.result).toMatchObject({ vorschau: true, vorher: "zugewiesen an Kerstin", nachher: "erledigt von Kerstin" });
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } })).status).toBe("ASSIGNED");

    const r = await call("reinigung_status", { buchung_id: id, status: "erledigt", bestaetigt: true });
    expect(r.result).toMatchObject({ ausgefuehrt: true });
    const a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a.status).toBe("COMPLETED");
    expect(a.rate).not.toBeNull();
    expect(sent.roles).toEqual([{ roles: ["ADMIN", "MANAGER"], title: "Reinigung erledigt" }]);
  });

  it("erledigt ohne Reinigungskraft wird abgelehnt", async () => {
    const r = await call("reinigung_status", { buchung_id: world.bookings.b3.id, status: "erledigt", bestaetigt: true });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/Reinigungskraft/);
  });

  it("selbstreinigung und offen nutzen dieselben Regeln wie die App", async () => {
    const id = world.bookings.b2.id;
    await call("reinigung_status", { buchung_id: id, status: "selbstreinigung", bestaetigt: true });
    let a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a).toMatchObject({ status: "SELF_CLEAN", isSelfClean: true, cleanerId: null });

    await prisma.cleaningAssignment.update({ where: { id: a.id }, data: { status: "ASSIGNED", isSelfClean: false, cleanerId: world.kerstin.id } });
    await call("reinigung_status", { buchung_id: id, status: "offen", bestaetigt: true });
    a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a).toMatchObject({ status: "UNASSIGNED", cleanerId: null });
    expect(sent.roles.at(-1)).toEqual({ roles: ["CLEANER"], title: "Reinigung wieder verfügbar" });
  });
});

describe("waesche_status", () => {
  it("bestellt: Vorschau mit Mengen, dann Status, Zeitpunkt und Mengen festgehalten", async () => {
    const id = world.bookings.b2.id; // Lodge, 4 Gäste, 1 Set je 2 Gäste, 2 Handtücher je Gast, 1 Küchentuch
    const v = await call("waesche_status", { buchung_id: id, status: "bestellt", notiz: "Bestellung W-123" });
    expect(v.result).toMatchObject({ vorschau: true, vorher: "offen", nachher: "bestellt", mengen: "2 Spannbettlaken 180, 4 Bettbezüge, 4 Kissenbezüge, 8 große Handtücher, 8 kleine Handtücher, 4 Waschlappen, 1 Badvorleger, 1 Küchentücher" });

    const r = await call("waesche_status", { buchung_id: id, status: "bestellt", notiz: "Bestellung W-123", bestaetigt: true });
    expect(r.result).toMatchObject({ ausgefuehrt: true });
    const a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a).toMatchObject({ laundryStatus: "ORDERED", laundryNotes: "Bestellung W-123" });
    expect(a.laundryOrderedAt).toBeInstanceOf(Date);
    expect(a.laundryQuantity).toEqual({ beds: 2, sheets90: 0, sheets200: 0, towels: 8, kitchen: 1, handTowels: 8, pillowCases: 4, duvetCovers: 4, bathMats: 1, washcloths: 4 });
  });

  it("gleicher Stand → unverändert, kein Schreiben", async () => {
    const r = await call("waesche_status", { buchung_id: world.bookings.b2.id, status: "offen", bestaetigt: true });
    expect(r.result).toMatchObject({ ausgefuehrt: false, unveraendert: true });
  });
});

describe("wochenplan", () => {
  it("zeigt die Woche mit Warnungen: ohne Reinigungskraft, abgesagt — Wäsche nur nach Bestand, nie pro Buchung", async () => {
    const r = await call("wochenplan", {});
    expect(r.ok).toBe(true);
    expect(r.result.zeitraum).toEqual({ von: "2026-10-30", bis: "2026-11-05" });
    const arten = r.result.warnungen.map((w: any) => `${w.datum} ${w.art}`);
    // Wäschestatus „offen“ pro Buchung ist kein Problem mehr (Entscheidung Mathias 31.10.2026)
    expect(arten.some((a: string) => a.includes("waesche_offen"))).toBe(false);
    expect(r.result.tage[0].anreisen[0].waesche).toBeUndefined();
    // ohne Zählung: keine Bestand-Warnung, aber Hinweis
    expect(r.result.waesche_bestand.lage).toMatch(/noch nicht erfasst/);
    // 01.11. Penthouse Eva Klein: Absage von Vanessa
    expect(arten).toContain("2026-11-01 abgesagt");
    // 05.11. Lodge Clara Wolf: niemand zugewiesen
    expect(arten).toContain("2026-11-05 ohne_reinigungskraft");
  });

  it("Wäsche reicht nicht → eine Bestand-Warnung mit Tag des Engpasses", async () => {
    const plenty = { beds: 50, sheets90: 50, sheets200: 50, towels: 50, kitchen: 50, handTowels: 50, pillowCases: 50, duvetCovers: 50, bathMats: 50, washcloths: 50 };
    // Handtücher: 30.10. Lodge 4 P. × 2 = 8, 01.11. Penthouse 5 P. = 5, Reserve 3 → bei 15 reicht es ab 01.11. nicht
    await prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: new Date("2026-10-29T00:00:00Z"), quantities: { ...plenty, towels: 15 } } });
    const r = await call("wochenplan", {});
    const w = r.result.warnungen.filter((x: any) => x.art === "waesche_reicht_nicht");
    expect(w).toHaveLength(1);
    expect(w[0].datum).toBe("2026-11-01");
    expect(r.result.waesche_bestand.lage).toBe("reicht nicht ab 2026-11-01");
  });
});
