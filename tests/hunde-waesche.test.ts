import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/mail", () => ({ sendCleaningAssignmentMail: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => ({
  sendPushToUsers: vi.fn(async () => ({ notConfigured: false, devices: 1, sent: 1, failed: 0, removed: 0 })),
  sendPushToRole: vi.fn(async () => undefined),
}));

import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { detectDogs, petFee, petFeeMessage } from "@/lib/pets";
import { calculateLaundryQuantity } from "@/lib/laundry-quantity";
import { planLaundry, DEFAULT_RESERVE } from "@/lib/laundry-order";
import { isAutomationMessage } from "@/lib/guest-messages";
import { resetDb, seedWorld } from "./fixtures";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// ─── Erkennung (rein) ─────────────────────────────────────────────────────────

describe("detectDogs", () => {
  it.each([
    ["Ein klein Hund ist bei unserem Aufenthalt mit dabei", 1],
    ["Wir kommen mit 2 Hunden", 2],
    ["Wir bringen zwei kleine Hunde mit.", 2],
    ["We will travel with our dog", 1],
    ["Hallo, wir haben einen Hund dabei, ist das ok?", 1],
    ["Unser Hund (Labrador) kommt mit", 1],
  ])("%s → %i", (text, n) => {
    expect(detectDogs(text)?.count).toBe(n);
  });

  it.each([
    "Wir kommen ohne Hund",
    "Kein Hund, keine Haustiere",
    "No pets, thank you",
    "Sind Hunde erlaubt?",
    "Wir haben bei Hundeurlaub.de gesucht",
    "Ankunft gegen 16 Uhr",
    "",
  ])("kein Hund: %s", (text) => {
    expect(detectDogs(text)).toBeNull();
  });

  it("Fundstelle wird mitgeliefert", () => {
    expect(detectDogs("Hallo! Ein klein Hund ist bei unserem Aufenthalt mit dabei. LG")?.hint).toMatch(/klein Hund/);
  });
});

describe("petFee", () => {
  const base = { checkIn: d("2026-12-29"), checkOut: d("2027-01-03") };
  it("Booking.com: 15 € × Hunde × Nächte, offen", () => {
    expect(petFee({ ...base, petCount: 1, channelName: "Booking.com" })).toEqual({ state: "OFFEN", amount: 75, dogs: 1, nights: 5 });
    expect(petFee({ ...base, petCount: 2, channelName: "Booking.com" }).amount).toBe(150);
  });
  it("Airbnb kassiert selbst", () => {
    expect(petFee({ ...base, petCount: 1, channelName: "Airbnb" }).state).toBe("PORTAL");
  });
  it("Stand angefordert/bezahlt/erlassen", () => {
    expect(petFee({ ...base, petCount: 1, channelName: "Booking.com", petFeeStatus: "REQUESTED", petFeeAmount: 75 }).state).toBe("ANGEFORDERT");
    expect(petFee({ ...base, petCount: 1, channelName: "Booking.com", petFeeStatus: "PAID", petFeeAmount: 75 }).state).toBe("BEZAHLT");
    expect(petFee({ ...base, petCount: 1, channelName: "Booking.com", petFeeStatus: "WAIVED" })).toMatchObject({ state: "ERLASSEN", amount: 0 });
  });
  it("kein Hund", () => {
    expect(petFee({ ...base, petCount: 0, channelName: "Booking.com" }).state).toBe("KEINE");
  });
  it("Nachricht nennt Betrag; ohne Zahlungsweg Platzhalter", () => {
    const t = petFeeMessage({ guestName: "Barbara Baumgartner", dogs: 1, nights: 5, amount: 75 });
    expect(t).toMatch(/Hallo Barbara/);
    expect(t).toMatch(/75 €/);
    expect(t).toMatch(/\[ZAHLUNGSWEG EINTRAGEN\]/);
    expect(petFeeMessage({ guestName: "B", dogs: 1, nights: 5, amount: 75, paymentText: "PayPal: paypal.me/x" })).not.toMatch(/ZAHLUNGSWEG/);
  });
});

describe("Smoobu-Automatik", () => {
  it("Zugangs-Automatik zählt nicht als Gespräch", () => {
    expect(isAutomationMessage({ betreff: "Automation for booking 123", text: "x" })).toBe(true);
    expect(isAutomationMessage({ betreff: null, text: "Guest will be granted access at 15:00" })).toBe(true);
    expect(isAutomationMessage({ betreff: null, text: "Danke!" })).toBe(false);
  });
});

// ─── Wäsche (rein) ────────────────────────────────────────────────────────────

describe("Wäschemenge pro Anreise", () => {
  it("Regel 30.10.2026: 3 Gäste", () => {
    expect(calculateLaundryQuantity(3, { laundryBedsDivisor: 2, laundryTowelsPerGuest: 1, laundryKitchenCount: 1 })).toEqual({
      beds: 2, duvetCovers: 3, pillowCases: 3, towels: 3, handTowels: 3, washcloths: 3, bathMats: 1, kitchen: 1,
    });
  });
});

describe("planLaundry (Bestand, Reserve, Lieferungen)", () => {
  const apt = { laundryBedsDivisor: 2, laundryTowelsPerGuest: 1, laundryKitchenCount: 1 };
  const arr = (ci: string, n: number, id = "L") => ({ apartmentId: id, apartmentName: id, guestName: "G", checkIn: d(ci), guestCount: n, apartment: apt });
  const q = (o: Partial<Record<string, number>>) => ({ beds: 0, towels: 0, kitchen: 0, handTowels: 0, pillowCases: 0, duvetCovers: 0, bathMats: 0, washcloths: 0, ...o });
  const arrivals = [arr("2026-10-28", 2), arr("2026-11-01", 4), arr("2026-11-05", 2, "P"), arr("2026-11-20", 5)];

  it("ohne Bestand: Bedarf + Reserve, Reserve bei jedem Teil", () => {
    const p = planLaundry({ arrivals, count: null, deliveries: [], today: d("2026-10-30"), end: d("2026-11-13") });
    expect(p.arrivals).toBe(2);
    expect(p.need).toMatchObject({ beds: 3, duvetCovers: 6, towels: 6, bathMats: 2 });
    for (const k of Object.keys(DEFAULT_RESERVE) as (keyof typeof DEFAULT_RESERVE)[]) {
      expect(p.order[k]).toBe(p.need[k] + DEFAULT_RESERVE[k]);
      expect(DEFAULT_RESERVE[k]).toBeGreaterThan(0);
    }
    expect(p.stockToday).toBeNull();
  });

  it("mit Bestand: Zählung minus Anreisen seit der Zählung, Lieferungen dazu", () => {
    const p = planLaundry({
      arrivals,
      count: { countedOn: d("2026-10-27"), quantities: q({ beds: 10, towels: 12, duvetCovers: 8, bathMats: 4 }) },
      deliveries: [{ deliveryOn: d("2026-10-29"), quantities: q({ towels: 4 }) }],
      today: d("2026-10-30"),
      end: d("2026-11-13"),
    });
    // 28.10. (2 Gäste) ist schon verbraucht: Spannbettlaken 10−1, Handtücher 12+4−2, Bettbezüge 8−2, Badvorleger 4−1
    expect(p.stockToday).toMatchObject({ beds: 9, towels: 14, duvetCovers: 6, bathMats: 3 });
    // Bestellen = Bedarf + Reserve − Bestand, nie negativ
    expect(p.order.beds).toBe(Math.max(0, 3 + DEFAULT_RESERVE.beds - 9));
    expect(p.order.towels).toBe(Math.max(0, 6 + DEFAULT_RESERVE.towels - 14));
    expect(p.order.duvetCovers).toBe(6 + DEFAULT_RESERVE.duvetCovers - 6);
    expect(p.stockAfter!.towels).toBeGreaterThanOrEqual(DEFAULT_RESERVE.towels);
  });

  it("schon bestellte Lieferung im Zeitraum wird abgezogen; Engpass davor wird gemeldet", () => {
    const p = planLaundry({
      arrivals,
      count: { countedOn: d("2026-10-29"), quantities: q({ duvetCovers: 2 }) },
      deliveries: [{ deliveryOn: d("2026-11-03"), quantities: q({ duvetCovers: 10 }) }],
      today: d("2026-10-30"),
      end: d("2026-11-13"),
      reserve: q({ duvetCovers: 2 }),
    });
    expect(p.incoming.duvetCovers).toBe(10);
    expect(p.order.duvetCovers).toBe(0); // 6 + 2 − 2 − 10 < 0
    expect(p.shortBeforeDelivery).toContain("duvetCovers"); // 01.11.: 4 Gäste, nur 2 da
  });
});

// ─── Tools ────────────────────────────────────────────────────────────────────

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;
let replies: Record<string, () => Response>;
let posts: { url: string; body?: string }[];

async function call(name: string, args: Record<string, unknown> = {}) {
  return runTool(findTool(name)!, args, ctx) as Promise<{ ok: boolean; result: any }>;
}

function page(messages: unknown[]) {
  return new Response(JSON.stringify({ page_count: 1, page: 1, total_items: messages.length, messages }), { status: 200 });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
  // b2 (Lodge, Booking.com, 30.10.–02.11., 1 Hund aus Fixture), b5 (Penthouse, Booking.com, 01.–04.11.)
  await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 9002, petCount: null } });
  await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { smoobuId: 9005 } });
  ctx = { organizationId: world.org.id, tokenId: "tok1", tokenName: "Claude", scopes: [...SCOPES] };
  replies = {};
  posts = [];
  process.env.SMOOBU_API_KEY = "key-test";
  process.env.SMOOBU_API_SECRET = "secret-test";
  delete process.env.PET_FEE_PAYMENT_TEXT;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const url = String(input);
    if ((init.method ?? "GET") === "POST") posts.push({ url, body: init.body });
    const key = Object.keys(replies).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    return replies[key]!();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("hunde_pruefen", () => {
  beforeEach(() => {
    replies["/reservations/9005/messages/send"] = () => new Response("{}", { status: 201 });
    replies["/reservations/9005/messages"] = () =>
      page([
        { id: 1, subject: "Automation for booking 9005", message: "Guest will be granted access", type: 2 },
        { id: 2, subject: null, message: "Hallo, ein klein Hund ist bei unserem Aufenthalt mit dabei", type: 1 },
        { id: 3, subject: null, message: "Gerne, Hunde sind willkommen", type: 2 },
      ]);
  });

  it("Vorschau ändert nichts, bestaetigt trägt ein — nur Booking/Direkt, nicht Airbnb", async () => {
    const v = await call("hunde_pruefen", {});
    expect(v.result.vorschau).toBe(true);
    expect(v.result.funde).toHaveLength(1);
    expect(v.result.funde[0]).toMatchObject({ gast: "Eva Klein", hunde_erkannt: 1, quelle: "Gästechat", wuerde_eintragen: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: world.bookings.b5.id } })).petCount).toBeNull();

    const r = await call("hunde_pruefen", { bestaetigt: true });
    expect(r.result.funde[0]).toMatchObject({ eingetragen: true });
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: world.bookings.b5.id } });
    expect(b).toMatchObject({ petCount: 1, petSource: "chat" });
    expect(b.petHint).toMatch(/klein Hund/);
  });

  it("Hand-Eingabe wird nie überschrieben", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { petCount: 0, petSource: "manual" } });
    const r = await call("hunde_pruefen", { bestaetigt: true });
    expect(r.result.funde[0]).toMatchObject({ hinweis: expect.stringMatching(/von Hand/) });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: world.bookings.b5.id } })).petCount).toBe(0);
  });

  it("Hundegebühr: Übersicht, Anforderung mit Vorschau, ohne Zahlungsweg kein Senden, dann senden und Status", async () => {
    await call("hunde_pruefen", { bestaetigt: true });
    const u = await call("hunde_uebersicht");
    const eva = u.result.buchungen.find((x: any) => x.gast === "Eva Klein");
    expect(eva).toMatchObject({ hunde: 1, naechte: 3, gebuehr: 45, gebuehr_status: "noch nicht angefordert" });

    const v = await call("hundegebuehr_anfordern", { buchung_id: world.bookings.b5.id });
    expect(v.result).toMatchObject({ vorschau: true, achtung: expect.stringMatching(/Zahlungsweg/) });
    expect(v.result.text).toMatch(/45 €/);

    const blocked = await call("hundegebuehr_anfordern", { buchung_id: world.bookings.b5.id, bestaetigt: true });
    expect(blocked.ok).toBe(false);
    expect(posts).toHaveLength(0);

    process.env.PET_FEE_PAYMENT_TEXT = "Überweisung oder PayPal: paypal.me/test";
    const s = await call("hundegebuehr_anfordern", { buchung_id: world.bookings.b5.id, bestaetigt: true });
    expect(s.result).toMatchObject({ ausgefuehrt: true, gesendet: true, gebuehr_status: "angefordert" });
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!.body!).messageBody).toMatch(/paypal\.me\/test/);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "guest.message.sent" } });
    expect(JSON.stringify(audit.details)).not.toMatch(/paypal|Hallo/);

    const p = await call("hundegebuehr_status", { buchung_id: world.bookings.b5.id, status: "bezahlt", bestaetigt: true });
    expect(p.result).toMatchObject({ gebuehr_status: "bezahlt", gebuehr: 45 });
  });

  it("Airbnb: Anforderung abgelehnt", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b1.id }, data: { petCount: 1 } });
    const r = await call("hundegebuehr_anfordern", { buchung_id: world.bookings.b1.id });
    expect(r.ok).toBe(false);
  });
});

describe("wochenplan & waesche_bedarf", () => {
  it("Wochenplan warnt bei nicht angeforderter Hundegebühr", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { petCount: 1 } });
    const r = await call("wochenplan", { tage: 7 });
    expect(r.result.warnungen.some((w: any) => w.art === "hundegebuehr_offen" && w.buchung_id === world.bookings.b5.id)).toBe(true);
  });

  it("waesche_bedarf: ohne Bestand Bedarf + Reserve; Bestand erfassen senkt die Bestellmenge", async () => {
    const r = await call("waesche_bedarf", {});
    // Anreisen ab 30.10.: b2 Lodge 4 P., b5 Penthouse 5 P., b3 Lodge 3 P. — b6 storniert
    expect(r.result.anreisen).toBe(3);
    expect(r.result.gaeste).toBe(12);
    expect(r.result.bestellmenge["Spannbettlaken"]).toBe(2 + 3 + 2 + DEFAULT_RESERVE.beds);
    expect(r.result.hinweis_bestand).toMatch(/kein Bestand/);

    const v = await call("waesche_bestand_erfassen", { mengen: { spannbettlaken: 20, badvorleger: 1 } });
    expect(v.result.vorschau).toBe(true);
    await call("waesche_bestand_erfassen", { gezaehlt_am: "2026-10-29", mengen: { spannbettlaken: 20, badvorleger: 1 }, bestaetigt: true });
    const r2 = await call("waesche_bedarf", {});
    expect(r2.result.bestellmenge["Spannbettlaken"]).toBe(0);
    expect(r2.result.bestellmenge["Badvorleger"]).toBe(3 + DEFAULT_RESERVE.bathMats - 1);

    await call("waesche_lieferung_erfassen", { liefertag: "2026-11-02", mengen: { badvorleger: 4 }, bestaetigt: true });
    const r3 = await call("waesche_bedarf", {});
    expect(r3.result.bestellmenge["Badvorleger"]).toBe(0);
    expect(r3.result.achtung).toMatch(/Badvorleger/); // 30.10. + 01.11. Anreisen vor der Lieferung, nur 1 da

    await call("waesche_reserve", { mengen: { badvorleger: 5 }, bestaetigt: true });
    const r4 = await call("waesche_bedarf", {});
    expect(r4.result.reserve["Badvorleger"]).toBe(5);
    expect(r4.result.reserve["Spannbettlaken"]).toBe(DEFAULT_RESERVE.beds);
  });
});
