import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sent = vi.hoisted(() => ({ roles: [] as { roles: string[]; title: string }[], users: [] as { ids: string[]; title: string; body: string }[] }));
vi.mock("@/lib/mail", () => ({ sendCleaningAssignmentMail: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => ({
  sendPushToUsers: vi.fn(async (ids: string[], p: { title: string; body: string }) => { sent.users.push({ ids, title: p.title, body: p.body }); return { notConfigured: false, devices: 1, sent: 1, failed: 0, removed: 0 }; }),
  sendPushToRole: vi.fn(async (_org: string, roles: string[], p: { title: string }) => { sent.roles.push({ roles, title: p.title }); }),
}));

import { prisma } from "@/lib/prisma";
import { detectSpecialRequests } from "@/lib/special-requests";
import { scanNoteSuggestions, acceptNoteSuggestion, rejectNoteSuggestion } from "@/lib/note-suggestions";
import { setExtraBeds } from "@/lib/booking-actions";
import { arrivalQuantity, planLaundry } from "@/lib/laundry-order";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;
let replies: Record<string, unknown[]>;
let fetches: number;

const call = (name: string, args: Record<string, unknown> = {}) => runTool(findTool(name)!, args, ctx) as Promise<{ ok: boolean; result: any }>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
  await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 9002 } });
  await prisma.booking.update({ where: { id: world.bookings.b3.id }, data: { smoobuId: 9003 } });
  ctx = { organizationId: world.org.id, tokenId: "tok1", tokenName: "Claude", scopes: [...SCOPES] };
  sent.roles = [];
  sent.users = [];
  fetches = 0;
  replies = {
    "/reservations/9002/messages": [
      { id: 11, type: 1, subject: null, message: "Hallo! Wir bringen unser Baby mit — gibt es ein Kinderbett und einen Hochstuhl?" },
      { id: 12, type: 2, subject: null, message: "Ja, gern. Getrennt in beiden Schlafzimmern geht auch." },
    ],
    "/reservations/9003/messages": [{ id: 21, type: 1, subject: null, message: "Danke, wir brauchen kein Kinderbett." }],
  };
  process.env.SMOOBU_API_KEY = "key-test";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    fetches++;
    const url = String(input);
    const key = Object.keys(replies).find((k) => url.includes(k));
    if (!key) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ page_count: 1, page: 1, messages: replies[key] }), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sonderwünsche erkennen", () => {
  it("erkennt deutsche und englische Wünsche", () => {
    expect(detectSpecialRequests("Gibt es ein Reisebett und einen Hochstuhl?")?.labels).toEqual(["Kinderbett", "Hochstuhl"]);
    expect(detectSpecialRequests("Could we get a crib and a high chair?")?.labels).toEqual(["Kinderbett", "Hochstuhl"]);
    expect(detectSpecialRequests("We would like separate bedrooms please")?.labels).toEqual(["Getrennt schlafen (beide Schlafzimmer)"]);
    expect(detectSpecialRequests("Lieber getrennt in beiden Schlafzimmern")?.labels).toEqual(["Getrennt schlafen (beide Schlafzimmer)"]);
    expect(detectSpecialRequests("Ist ein early check-in möglich?")?.labels).toEqual(["Früher Check-in"]);
    expect(detectSpecialRequests("Can we have a late check-out?")?.labels).toEqual(["Später Check-out"]);
    const z = detectSpecialRequests("Wir bräuchten ein Zustellbett für unseren Sohn");
    expect(z?.labels).toEqual(["Zustellbett"]);
    expect(z?.extraBeds).toBe(1);
  });

  it("ignoriert Verneinungen und Nachrichten ohne Wunsch", () => {
    expect(detectSpecialRequests("Wir brauchen kein Kinderbett, danke")).toBeNull();
    expect(detectSpecialRequests("No crib needed")).toBeNull();
    expect(detectSpecialRequests("Wir schlafen zu zweit in einem Zimmer, nicht getrennt.")).toBeNull();
    expect(detectSpecialRequests("Wann ist der Check-in?")).toBeNull();
    expect(detectSpecialRequests(null)).toBeNull();
  });

  it("Auszug höchstens 200 Zeichen", () => {
    const long = "Bla ".repeat(100) + "Kinderbett bitte " + "bla ".repeat(100);
    expect(detectSpecialRequests(long)!.excerpt.length).toBeLessThanOrEqual(200);
  });
});

describe("Vorschläge aus dem Gästechat", () => {
  it("legt je Gastnachricht genau einen Vorschlag an, gedrosselt und idempotent, mit Push an Admin/Verwaltung", async () => {
    const r = await scanNoteSuggestions(world.org.id);
    expect(r.created).toBe(1);
    const rows = await prisma.noteSuggestion.findMany({ where: { organizationId: world.org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bookingId).toBe(world.bookings.b2.id);
    expect(rows[0]!.proposedText).toBe("Kinderbett, Hochstuhl");
    expect(rows[0]!.status).toBe("PENDING");
    expect(sent.roles).toHaveLength(1);
    expect(sent.roles[0]!.roles).toEqual(["ADMIN", "MANAGER"]);
    expect(sent.roles[0]!.title).toMatch(/^Sonderwunsch erkannt: Lodge 30\.10\. – übernehmen\?$/);

    // Gedrosselt: zweiter Lauf direkt danach fragt Smoobu nicht
    const before = fetches;
    expect((await scanNoteSuggestions(world.org.id)).skipped).toBe(true);
    expect(fetches).toBe(before);

    // Erzwungen: dieselbe Nachricht wird nicht noch einmal verwertet
    expect((await scanNoteSuggestions(world.org.id, { force: true })).created).toBe(0);
    expect(sent.roles).toHaveLength(1);
  });

  it("Übernehmen hängt an den Hinweis an und benachrichtigt die zugewiesene Reinigungskraft; Audit ohne Text", async () => {
    await prisma.cleaningAssignment.update({ where: { bookingId: world.bookings.b2.id }, data: { notes: "Schlüssel im Kasten" } });
    await scanNoteSuggestions(world.org.id);
    const s = (await prisma.noteSuggestion.findFirst({ where: { organizationId: world.org.id } }))!;
    const r = await acceptNoteSuggestion({ organizationId: world.org.id, id: s.id, text: "Kinderbett + Hochstuhl aufbauen", extraBeds: 1, actor: { userId: world.admin.id } });
    expect(r.notes).toBe("Schlüssel im Kasten\nKinderbett + Hochstuhl aufbauen");
    expect(r.notified).toBe(true);
    const a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: world.bookings.b2.id } });
    expect(a.notes).toBe("Schlüssel im Kasten\nKinderbett + Hochstuhl aufbauen");
    expect(a.extraBeds).toBe(1);
    expect(sent.users[0]!.ids).toEqual([world.kerstin.id]);
    expect(sent.users[0]!.title).toMatch(/Hinweis für deine Reinigung/);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "note_suggestion.accepted" } });
    expect(JSON.stringify(audit.details)).not.toMatch(/Kinderbett|Baby/);

    // Schon entschieden → kein zweites Mal
    await expect(acceptNoteSuggestion({ organizationId: world.org.id, id: s.id, actor: {} })).rejects.toThrow(/schon entschieden/);
  });

  it("Verwerfen lässt den Hinweis unverändert", async () => {
    await scanNoteSuggestions(world.org.id);
    const s = (await prisma.noteSuggestion.findFirst({ where: { organizationId: world.org.id } }))!;
    await rejectNoteSuggestion({ organizationId: world.org.id, id: s.id, actor: { userId: world.admin.id } });
    expect((await prisma.noteSuggestion.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("REJECTED");
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: world.bookings.b2.id } })).notes).toBeNull();
  });

  it("MCP: hinweis_vorschlaege listet, hinweis_uebernehmen zeigt erst Vorschau", async () => {
    const list = await call("hinweis_vorschlaege", { neu_pruefen: true });
    expect(list.ok).toBe(true);
    expect(list.result.anzahl).toBe(1);
    const v = list.result.vorschlaege[0];
    expect(v.vorschlag).toBe("Kinderbett, Hochstuhl");
    expect(v.auszug).toMatch(/Kinderbett/);

    const pre = await call("hinweis_uebernehmen", { vorschlag_id: v.vorschlag_id, text: "Kinderbett aufbauen" });
    expect(pre.result.vorschau).toBe(true);
    expect(pre.result.hinweis_neu).toBe("Kinderbett aufbauen");
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: world.bookings.b2.id } })).notes).toBeNull();

    const done = await call("hinweis_uebernehmen", { vorschlag_id: v.vorschlag_id, text: "Kinderbett aufbauen", bestaetigt: true });
    expect(done.result.ausgefuehrt).toBe(true);
    expect(done.result.hinweis).toBe("Kinderbett aufbauen");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "mcp.hinweis_uebernehmen", details: { path: ["status"], equals: "ok" } } });
    expect(JSON.stringify(audit.details)).not.toMatch(/Kinderbett/);
  });
});

describe("Zusatzbetten in der Wäscheplanung", () => {
  it("je Zusatzbett ein 90er Laken, Bett- und Kissenbezug", () => {
    const apt = { laundryBeds: [{ width: 180, persons: 2 }] };
    const base = arrivalQuantity({ guestCount: 2, apartment: apt });
    const extra = arrivalQuantity({ guestCount: 2, extraBeds: 2, apartment: apt });
    expect(extra.sheets90 - base.sheets90).toBe(2);
    expect(extra.duvetCovers - base.duvetCovers).toBe(2);
    expect(extra.pillowCases - base.pillowCases).toBe(2);
    expect(extra.towels).toBe(base.towels);

    const d = new Date("2026-11-01T00:00:00Z");
    const plan = planLaundry({
      arrivals: [{ apartmentId: "a", apartmentName: "Lodge", guestName: "X", checkIn: d, guestCount: 2, extraBeds: 1, apartment: apt }],
      count: null, deliveries: [], today: new Date("2026-10-30T00:00:00Z"), end: new Date("2026-11-13T00:00:00Z"),
    });
    expect(plan.need.sheets90).toBe(1);
  });

  it("setExtraBeds prüft 0–3 und schreibt Audit", async () => {
    await expect(setExtraBeds({ organizationId: world.org.id, bookingId: world.bookings.b2.id, extraBeds: 4, actor: {} })).rejects.toThrow(/0 bis 3/);
    const r = await setExtraBeds({ organizationId: world.org.id, bookingId: world.bookings.b2.id, extraBeds: 1, actor: { userId: world.admin.id } });
    expect(r.changed).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "assignment.extra_beds.updated" } })).toBe(1);
  });
});
