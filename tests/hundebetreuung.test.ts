import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runDogCareMessages, dogCareTextDe } from "@/lib/dog-care-message";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let posts: { url: string; body: any }[];

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DAY = new Date("2026-11-11T09:30:00Z"); // 10:30 Wien

async function booking(o: { guest: string; ci: string; pets?: number; smoobuId: number; notice?: string; manual?: boolean }) {
  return prisma.booking.create({
    data: {
      organizationId: world.org.id, apartmentId: world.penthouse.id, guestName: o.guest, guestCount: 2,
      checkIn: d(o.ci), checkOut: d(o.ci.replace(/\d\d$/, (x) => String(Number(x) + 2).padStart(2, "0"))),
      channelName: "Booking.com", status: "confirmed", smoobuId: o.smoobuId, channelNotice: o.notice ?? null,
      petCount: o.pets ?? null, petSource: o.pets ? (o.manual ? "manual" : "notice") : null,
    },
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY);
  await resetDb();
  world = await seedWorld();
  posts = [];
  process.env.SMOOBU_API_KEY = "key-test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const url = String(input);
    if (!init.method || init.method === "GET") return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    posts.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({}), { status: 201 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Hundebetreuung", () => {
  it("Winter- und Sommertext wie freigegeben", () => {
    const w = dogCareTextDe("Anna Muster", d("2026-12-05"));
    expect(w).toContain("Hallo Anna,");
    expect(w).toContain("wir freuen uns schon auf dich und deinen Hund!");
    expect(w).toContain("Winterplanung: Auf die Skipiste, in die Therme oder über den Weihnachtsmarkt");
    expect(w).toContain("winterliche Natur rund um Füssen");
    expect(w).toContain("www.froehliche-pfoten-allgaeu.de");
    expect(w).not.toContain("ohne Hund");
    const s = dogCareTextDe("Anna", d("2027-06-05"));
    expect(s).toContain("Schloss Neuschwanstein, eine Bergtour mit Seilbahn");
    expect(s).toContain("raus in die Natur rund um Füssen");
  });

  it("nur Gäste mit Hund, genau 14 Tage vorher, einmal", async () => {
    const mitHund = await booking({ guest: "Anna Muster", ci: "2026-11-24", pets: 1, smoobuId: 701 });
    await booking({ guest: "Ohne Hund", ci: "2026-11-24", smoobuId: 702 });
    await booking({ guest: "Zu Früh", ci: "2026-12-10", pets: 1, smoobuId: 703 });
    const r = await runDogCareMessages(world.org.id);
    expect(r.sent).toBe(1);
    expect(posts.filter((p) => p.url.includes("701"))).toHaveLength(1);
    expect(posts.some((p) => p.url.includes("702") || p.url.includes("703"))).toBe(false);
    const again = await runDogCareMessages(world.org.id);
    expect(again.sent).toBe(0);
    expect((await prisma.booking.findUnique({ where: { id: mitHund.id } }))?.dogCareMessageSentAt).toBeTruthy();
  });

  it("kurzfristig und Englisch warten auf Freigabe, nachts nichts", async () => {
    await booking({ guest: "Kurz Fristig", ci: "2026-11-15", pets: 1, smoobuId: 711 });
    await booking({ guest: "John Smith", ci: "2026-11-24", pets: 1, smoobuId: 712, notice: "Sprache des Gastes: en" });
    const r = await runDogCareMessages(world.org.id);
    expect(r.sent).toBe(0);
    expect(r.waitingApproval).toBe(2);
    vi.setSystemTime(new Date("2026-11-11T22:00:00Z"));
    expect((await runDogCareMessages(world.org.id)).skippedNight).toBe(true);
  });

  it("erkennt Hund aus der Portalnotiz bei der regelmäßigen Prüfung", async () => {
    const b = await booking({ guest: "Notiz Hund", ci: "2026-11-24", smoobuId: 721, notice: "Wir reisen mit unserem Hund an" });
    const r = await runDogCareMessages(world.org.id);
    expect(r.scanned).toBeGreaterThan(0);
    const nb = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(nb?.petCount ?? 0).toBeGreaterThan(0);
    expect(r.sent).toBe(1);
  });
});
