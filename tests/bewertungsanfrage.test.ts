import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runReviewRequests, reviewRequestText, isAirbnbReviewSubject, REVIEW_REQUEST_TEXT } from "@/lib/review-request";
import { resetDb, seedWorld } from "./fixtures";

// ─── Bewertungsanfrage: gefälschter IMAP-Server + abgefangenes Smoobu ─────────
// Keine echten Verbindungen. IMAP wird wie in tests/mailbox.test.ts ersetzt (ohne SEARCH,
// Flags dürfen sich nicht ändern), Smoobu über ein ersetztes fetch.

type FakeMsg = { uid: number; flags: Set<string>; raw: string };
const imap = vi.hoisted(() => ({ folders: {} as Record<string, FakeMsg[]>, current: "", fail: false, flagChanges: 0 }));

function rawMail(p: { from: string; subject: string; date: string; uid: number }) {
  return [
    `From: ${p.from}`, "To: info@vils17.at", `Subject: ${p.subject}`, `Message-ID: <m${p.uid}@test>`,
    `Date: ${p.date}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", "Text", "",
  ].join("\r\n");
}

vi.mock("imapflow", async () => {
  const { simpleParser } = await import("mailparser");
  const toAddr = (a: any) => (a ? a.value.map((v: any) => ({ name: v.name, address: v.address })) : []);
  class ImapFlow {
    mailbox: { path: string; exists: number } | false = false;
    async connect() { if (imap.fail) throw new Error("ECONNREFUSED"); }
    async logout() {}
    async getMailboxLock(path: string) {
      if (!imap.folders[path]) throw new Error("no such mailbox");
      imap.current = path;
      this.mailbox = { path, exists: imap.folders[path]!.length };
      return { release() {} };
    }
    async list() {
      const use: Record<string, string> = { INBOX: "\\Inbox", Sent: "\\Sent", Trash: "\\Trash" };
      return Object.keys(imap.folders).map((p) => ({ path: p, name: p, flags: new Set<string>(), specialUse: use[p], status: { unseen: 0 } }));
    }
    async search(): Promise<number[]> { throw new Error("SEARCH wird nicht benutzt (Strato liefert keine Treffer)"); }
    async *fetch(range: string) {
      const [lo, hi] = range.split(":").map(Number);
      for (const m of imap.folders[imap.current]!.slice(lo! - 1, hi!)) {
        const p = await simpleParser(m.raw);
        yield { uid: m.uid, flags: new Set(m.flags), size: m.raw.length, envelope: { subject: p.subject, date: p.date, from: toAddr(p.from), to: toAddr(p.to) }, bodyStructure: { type: "text/plain" } };
      }
    }
    async messageFlagsAdd() { imap.flagChanges++; return true; }
    async messageFlagsRemove() { imap.flagChanges++; return true; }
  }
  return { ImapFlow };
});

const ENV = { IMAP_HOST: "imap.strato.de", IMAP_USER: "info@vils17.at", IMAP_PASS: "geheim", REVIEW_REQUEST_ENABLED: "true" };

let world: Awaited<ReturnType<typeof seedWorld>>;
let posts: { url: string; body: any }[];
let status: number;
let uid = 1;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DAY = new Date("2026-10-31T08:30:00Z"); // 09:30 Wien → regulär fällig: Abreise 29.10.

function inbox(subject: string, date = "Thu, 29 Oct 2026 12:00:00 +0100", from = "Airbnb <automated@airbnb.com>", folder = "INBOX") {
  const n = uid++;
  imap.folders[folder]!.push({ uid: n, flags: new Set(), raw: rawMail({ from, subject, date, uid: n }) });
}

async function booking(o: { guest: string; ci: string; co: string; smoobuId: number; ch?: string; notice?: string; status?: string }) {
  return prisma.booking.create({
    data: {
      organizationId: world.org.id, apartmentId: world.penthouse.id, guestName: o.guest, guestCount: 2,
      checkIn: d(o.ci), checkOut: d(o.co), channelName: o.ch ?? "Airbnb", status: o.status ?? "confirmed", smoobuId: o.smoobuId,
      channelNotice: o.notice ?? null,
    },
  });
}
const reload = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY);
  await resetDb();
  world = await seedWorld();
  imap.folders = { INBOX: [], Sent: [], Trash: [] };
  imap.fail = false;
  imap.flagChanges = 0;
  Object.assign(process.env, ENV);
  delete process.env.REVIEW_REQUEST_FROM;
  posts = [];
  status = 201;
  process.env.SMOOBU_API_KEY = "key-test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    posts.push({ url: String(input), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({}), { status });
  });
});

afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  delete process.env.REVIEW_REQUEST_FROM;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Bewertungsanfrage", () => {
  it("Texte wörtlich, Kanal eingesetzt, Direktbuchung ohne Kanal", () => {
    expect(reviewRequestText("Anna Muster", "de", "Airbnb")).toBe(
      "Hallo Anna,\n\nschön, dass du bei uns warst – wir hoffen, es hat dir gefallen! ✨\nWir würden uns sehr über eine kurze Bewertung auf Airbnb freuen.\n\nAuch dein persönliches Feedback ist uns wichtig – so können wir den Aufenthalt für dich und unsere zukünftigen Gäste kontinuierlich verbessern.\n\nVielen Dank & liebe Grüße\nMathias"
    );
    expect(reviewRequestText("Anna Muster", "de", "Booking.com")).toContain("eine kurze Bewertung auf Booking.com freuen.");
    expect(reviewRequestText("Anna Muster", "de", "Direkt")).toBe(
      REVIEW_REQUEST_TEXT.de.replace("[Vorname]", "Anna").replace(" auf [channel] freuen.", " freuen.")
    );
    expect(reviewRequestText("Anna Muster", "de", "Direkt")).toContain("Wir würden uns sehr über eine kurze Bewertung freuen.");
    expect(reviewRequestText("John Smith", "en", "Airbnb")).toBe(
      "Hello John,\n\nwe were happy to host you and hope you enjoyed your stay!\nWe would really appreciate a short review.\n\nBest regards\nMathias"
    );
  });

  it("erkennt Bewertungsmails, aber nicht „wartet auf deine Bewertung“", () => {
    expect(isAirbnbReviewSubject("Anna hat eine 5-Sterne-Bewertung hinterlassen", "Anna")).toBe(true);
    expect(isAirbnbReviewSubject("Anna hat eine 4‑Sterne-Bewertung hinterlassen", "Anna")).toBe(true);
    expect(isAirbnbReviewSubject("Anna hat dir eine Bewertung geschrieben", "Anna")).toBe(true);
    expect(isAirbnbReviewSubject("Anna left a 5-star review", "Anna")).toBe(true);
    expect(isAirbnbReviewSubject("Anna wrote you a review", "Anna")).toBe(true);
    expect(isAirbnbReviewSubject("Anna wartet auf deine Bewertung", "Anna")).toBe(false);
    expect(isAirbnbReviewSubject("Anna is waiting for your review", "Anna")).toBe(false);
    expect(isAirbnbReviewSubject("Peter hat eine 5-Sterne-Bewertung hinterlassen", "Anna")).toBe(false);
  });

  it("Schalter aus → nichts", async () => {
    await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801 });
    delete process.env.REVIEW_REQUEST_ENABLED;
    expect((await runReviewRequests(world.org.id)).disabled).toBe(true);
    process.env.REVIEW_REQUEST_ENABLED = "1";
    expect((await runReviewRequests(world.org.id)).disabled).toBe(true);
    expect(posts).toHaveLength(0);
  });

  it("fällig: Abreise vor 2–7 Tagen, bestätigt; nicht früher, nicht älter, nicht storniert/blockiert", async () => {
    const regular = await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801 });
    const late = await booking({ guest: "Nina Nachholen", ci: "2026-10-20", co: "2026-10-24", smoobuId: 802 });
    await booking({ guest: "Zu Früh", ci: "2026-10-27", co: "2026-10-30", smoobuId: 803 });
    await booking({ guest: "Zu Alt", ci: "2026-10-20", co: "2026-10-23", smoobuId: 804 });
    await booking({ guest: "Storno Gast", ci: "2026-10-26", co: "2026-10-29", smoobuId: 805, status: "cancelled" });
    await booking({ guest: "Block", ci: "2026-10-26", co: "2026-10-29", smoobuId: 806, ch: "Blocked channel" });

    const r = await runReviewRequests(world.org.id);
    expect(r.sent).toBe(2);
    expect(posts.map((p) => p.url).sort()).toEqual([
      expect.stringContaining("/reservations/801/messages/send-message-to-guest"),
      expect.stringContaining("/reservations/802/messages/send-message-to-guest"),
    ]);
    expect((await reload(regular.id)).reviewRequestSentAt).not.toBeNull();
    expect((await reload(late.id)).reviewRequestSentAt).not.toBeNull();
  });

  it("Uhrzeit: erst ab 8:00 Wien, nicht ab 21 Uhr", async () => {
    await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801 });
    vi.setSystemTime(new Date("2026-10-31T06:30:00Z")); // 07:30 Wien
    expect((await runReviewRequests(world.org.id)).skippedTime).toBe(true);
    vi.setSystemTime(new Date("2026-10-30T20:10:00Z")); // 21:10 Wien
    expect((await runReviewRequests(world.org.id)).skippedTime).toBe(true);
    vi.setSystemTime(new Date("2026-10-31T01:00:00Z")); // 02:00 Wien
    expect((await runReviewRequests(world.org.id)).skippedTime).toBe(true);
    expect(posts).toHaveLength(0);
    vi.setSystemTime(new Date("2026-10-31T07:00:00Z")); // 08:00 Wien
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
  });

  it("Booking.com und Direkt: keine Anfrage (Entscheidung 31.10.2026)", async () => {
    const b = await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801, ch: "Booking.com" });
    const d2 = await booking({ guest: "Dora Direkt", ci: "2026-10-26", co: "2026-10-29", smoobuId: 802, ch: "Direct booking" });
    expect((await runReviewRequests(world.org.id)).sent).toBe(0);
    expect(posts).toHaveLength(0);
    expect((await reload(b.id)).reviewRequestSentAt).toBeNull();
    expect((await reload(d2.id)).reviewRequestSentAt).toBeNull();
  });

  it("Airbnb ohne Bewertung: genau einmal gesendet, englisch, Audit ohne Text/Namen", async () => {
    const b = await booking({ guest: "Bea Gast", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801, notice: "Sprache des Gastes: en" });
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
    expect(posts[0]!.body.messageBody).toMatch(/^Hello Bea,\n\nwe were happy/);
    expect((await runReviewRequests(world.org.id)).sent).toBe(0);
    expect(posts).toHaveLength(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "guest.message.sent", entityId: b.id } });
    expect(JSON.stringify(audit.details)).toContain("bewertungsanfrage");
    expect(JSON.stringify(audit.details)).not.toMatch(/Bea|Hallo|Hello|review|@/i);
  });

  it("Airbnb mit Bewertungsmail seit Anreise → übersprungen, nichts gesendet, Mail nicht als gelesen markiert", async () => {
    const b = await booking({ guest: "Anna Muster", ci: "2026-10-26", co: "2026-10-29", smoobuId: 901 });
    inbox("Anna hat eine 5-Sterne-Bewertung hinterlassen");
    const r = await runReviewRequests(world.org.id);
    expect(r.skippedReviewed).toBe(1);
    expect(r.sent).toBe(0);
    expect(posts).toHaveLength(0);
    const after = await reload(b.id);
    expect(after.reviewRequestSkippedAt).not.toBeNull();
    expect(after.reviewRequestSkipReason).toBe("airbnb_bewertung_vorhanden");
    expect(after.reviewRequestSentAt).toBeNull();
    expect(imap.flagChanges).toBe(0);
    expect(imap.folders.INBOX![0]!.flags.has("\\Seen")).toBe(false);
    // Folgelauf: bleibt übersprungen
    expect((await runReviewRequests(world.org.id)).sent).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "guest.review_request.skipped", entityId: b.id } });
    expect(JSON.stringify(audit.details)).not.toMatch(/Anna|@/);
  });

  it("Airbnb: Bewertungsmail auch im Papierkorb zählt; Mail von vor der Anreise oder anderem Absender nicht", async () => {
    const trash = await booking({ guest: "Tom Trash", ci: "2026-10-26", co: "2026-10-29", smoobuId: 911 });
    const old = await booking({ guest: "Olga Alt", ci: "2026-10-26", co: "2026-10-29", smoobuId: 912 });
    const fake = await booking({ guest: "Fritz Fremd", ci: "2026-10-26", co: "2026-10-29", smoobuId: 913 });
    inbox("Tom hat dir eine Bewertung geschrieben", undefined, undefined, "Trash");
    inbox("Olga hat eine 5-Sterne-Bewertung hinterlassen", "Mon, 01 Jun 2026 12:00:00 +0200");
    inbox("Fritz hat eine 5-Sterne-Bewertung hinterlassen", undefined, "Jemand <spam@example.com>");
    const r = await runReviewRequests(world.org.id);
    expect(r.skippedReviewed).toBe(1);
    expect(r.sent).toBe(2);
    expect((await reload(trash.id)).reviewRequestSkippedAt).not.toBeNull();
    expect((await reload(old.id)).reviewRequestSentAt).not.toBeNull();
    expect((await reload(fake.id)).reviewRequestSentAt).not.toBeNull();
  });

  it("Airbnb: „wartet auf deine Bewertung“ ist kein Signal → gesendet", async () => {
    const b = await booking({ guest: "Anna Muster", ci: "2026-10-26", co: "2026-10-29", smoobuId: 901 });
    inbox("Anna wartet auf deine Bewertung");
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
    expect(posts[0]!.body.messageBody).toContain("eine kurze Bewertung auf Airbnb freuen.");
    expect((await reload(b.id)).reviewRequestSentAt).not.toBeNull();
  });

  it("Airbnb: Postfach nicht erreichbar oder nicht eingerichtet → nichts gesendet, später erneut", async () => {
    const b = await booking({ guest: "Anna Muster", ci: "2026-10-26", co: "2026-10-29", smoobuId: 901 });
    imap.fail = true;
    expect((await runReviewRequests(world.org.id)).waitingForMailbox).toBe(1);
    delete process.env.IMAP_PASS;
    expect((await runReviewRequests(world.org.id)).waitingForMailbox).toBe(1);
    expect(posts).toHaveLength(0);
    const mid = await reload(b.id);
    expect(mid.reviewRequestSentAt).toBeNull();
    expect(mid.reviewRequestSkippedAt).toBeNull();
    // Postfach wieder da → jetzt gesendet
    imap.fail = false;
    process.env.IMAP_PASS = "geheim";
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
  });

  it("Smoobu lehnt ab → Zeitstempel zurückgesetzt, nächster Lauf sendet", async () => {
    const b = await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801 });
    status = 500;
    expect((await runReviewRequests(world.org.id)).failed).toBe(1);
    expect((await reload(b.id)).reviewRequestSentAt).toBeNull();
    status = 201;
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
    expect((await reload(b.id)).reviewRequestSentAt).not.toBeNull();
  });

  it("REVIEW_REQUEST_FROM: keine Nachhol-Anfrage für Abreisen vor dem Umstieg", async () => {
    await booking({ guest: "Bea Booking", ci: "2026-10-26", co: "2026-10-29", smoobuId: 801 });
    await booking({ guest: "Nina Nachholen", ci: "2026-10-20", co: "2026-10-24", smoobuId: 802 });
    process.env.REVIEW_REQUEST_FROM = "2026-10-31";
    expect((await runReviewRequests(world.org.id)).sent).toBe(1);
    expect(posts[0]!.url).toContain("/reservations/801/");
  });
});
