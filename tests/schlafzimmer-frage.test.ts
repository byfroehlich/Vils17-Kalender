import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runBedroomQuestions, guestLanguage, bedroomQuestionText, BEDROOM_QUESTION_TEXT } from "@/lib/bedroom-question";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let posts: { url: string; body: any }[];
let status: number;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DAY = new Date("2026-10-30T09:00:00Z"); // 10:00 Wien

async function booking(o: { guest: string; ci: string; co: string; n: number; smoobuId: number; notice?: string; unknown?: boolean; apt?: string }) {
  return prisma.booking.create({
    data: {
      organizationId: world.org.id, apartmentId: o.apt ?? world.penthouse.id, guestName: o.guest, guestCount: o.n,
      checkIn: d(o.ci), checkOut: d(o.co), channelName: "Airbnb", status: "confirmed", smoobuId: o.smoobuId,
      channelNotice: o.notice ?? null, guestCountUnknown: !!o.unknown,
    },
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY);
  await resetDb();
  world = await seedWorld();
  await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { askSeparateBedrooms: true } });
  posts = [];
  status = 201;
  process.env.SMOOBU_API_KEY = "key-test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    posts.push({ url: String(input), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({}), { status });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Schlafzimmer-Frage", () => {
  it("Texte wörtlich, Vorname, Sprache aus dem Portal-Hinweis", () => {
    expect(guestLanguage("Buchungsnummer: X\nSprache des Gastes: de")).toBe("de");
    expect(guestLanguage("Sprache des Gastes: en")).toBe("en");
    expect(guestLanguage("Sprache des Gastes: fr")).toBe("en");
    expect(guestLanguage(null)).toBe("de");
    expect(bedroomQuestionText("Michèle Podkowa", "de")).toBe(BEDROOM_QUESTION_TEXT.de.replace("[Vorname]", "Michèle"));
    expect(bedroomQuestionText("John Smith", "en")).toBe(
      "Hello John, great to have you at Penthouse No. 17! A quick question so everything is ready: will you share one bedroom, or would you prefer separate bedrooms? A short reply is enough. Best regards, Mathias"
    );
    expect(BEDROOM_QUESTION_TEXT.de).toBe(
      "Hallo [Vorname], schön, dass ihr ins Penthouse No. 17 kommt! Kurze Frage, damit alles vorbereitet ist: Möchtet ihr zu zweit in einem Schlafzimmer schlafen oder lieber getrennt in beiden Schlafzimmern? Eine kurze Antwort genügt. Liebe Grüße, Mathias"
    );
  });

  it("fragt genau einmal je passender Buchung, nur Penthouse, nur 2 bestätigte Gäste, nur künftig", async () => {
    const ok = await booking({ guest: "Anna Muster", ci: "2026-11-20", co: "2026-11-22", n: 2, smoobuId: 501, notice: "Sprache des Gastes: en" });
    await booking({ guest: "Drei Leute", ci: "2026-11-24", co: "2026-11-26", n: 3, smoobuId: 502 });
    await booking({ guest: "Unbekannt Booking", ci: "2026-11-27", co: "2026-11-29", n: 2, smoobuId: 503, unknown: true });
    await booking({ guest: "Lodge Paar", ci: "2026-11-20", co: "2026-11-22", n: 2, smoobuId: 504, apt: world.lodge.id });
    await booking({ guest: "Heute Da", ci: "2026-10-30", co: "2026-11-01", n: 2, smoobuId: 505 });

    const r = await runBedroomQuestions(world.org.id);
    expect(r.sent).toBe(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain("/reservations/501/messages/send-message-to-guest");
    expect(posts[0]!.body.messageBody).toMatch(/^Hello Anna, great to have you/);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ok.id } })).bedroomQuestionSentAt).not.toBeNull();

    // Zweiter Lauf: nichts mehr
    expect((await runBedroomQuestions(world.org.id)).sent).toBe(0);
    expect(posts).toHaveLength(1);

    // Audit ohne Text
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "guest.message.sent", entityId: ok.id } });
    expect(JSON.stringify(audit.details)).not.toMatch(/Anna|bedroom/i);
  });

  it("nicht zwischen 21 und 7 Uhr (Wien)", async () => {
    await booking({ guest: "Nacht Gast", ci: "2026-11-20", co: "2026-11-22", n: 2, smoobuId: 601 });
    vi.setSystemTime(new Date("2026-10-30T21:30:00Z")); // 22:30 Wien
    expect((await runBedroomQuestions(world.org.id)).skippedNight).toBe(true);
    vi.setSystemTime(new Date("2026-10-31T05:30:00Z")); // 06:30 Wien
    expect((await runBedroomQuestions(world.org.id)).skippedNight).toBe(true);
    expect(posts).toHaveLength(0);
    vi.setSystemTime(new Date("2026-10-31T06:05:00Z")); // 07:05 Wien
    expect((await runBedroomQuestions(world.org.id)).sent).toBe(1);
  });

  it("lehnt Smoobu ab, wird beim nächsten Lauf erneut versucht", async () => {
    const b = await booking({ guest: "Retry Gast", ci: "2026-11-20", co: "2026-11-22", n: 2, smoobuId: 701 });
    status = 500;
    expect((await runBedroomQuestions(world.org.id)).failed).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).bedroomQuestionSentAt).toBeNull();
    status = 201;
    expect((await runBedroomQuestions(world.org.id)).sent).toBe(1);
  });
});
