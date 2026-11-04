import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const pushes = vi.hoisted(() => [] as { roles: string[]; title: string; body: string; url?: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, roles: string[], p: { title: string; body: string; url?: string }) => { pushes.push({ roles, ...p }); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));
vi.mock("@/lib/mail", () => ({ sendCleaningAssignmentMail: vi.fn(async () => undefined) }));

import { prisma } from "@/lib/prisma";
import { runReminders, maybeSendDailyStatus, maybeSendLaundryAlert } from "@/lib/notifications";
import { isGuestCountUnconfirmed, guestCountSource } from "@/lib/guest-count";
import { setGuestCount } from "@/lib/booking-actions";
import { SmoobuAdapter } from "@/lib/channel-manager/smoobu";
import { DEFAULT_RESERVE } from "@/lib/laundry-order";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { resetDb, seedWorld } from "./fixtures";

// Gästezahl unbestätigt (Entscheidung Mathias 31.10.2026): sichtbar machen und klären lassen

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;
const gcPushes = () => pushes.filter((p) => p.title.includes("Gästezahl"));
const call = (name: string, args: Record<string, unknown> = {}) => runTool(findTool(name)!, args, ctx) as Promise<{ ok: boolean; result: any }>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
  // b5: Penthouse, Booking.com, Anreise 01.11. — Smoobu lieferte keine Gästezahl
  await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { guestCountUnknown: true, guestCount: 1 } });
  ctx = { organizationId: world.org.id, tokenId: "t", tokenName: "Claude", scopes: [...SCOPES] };
  pushes.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Gästezahl bestätigt / unbestätigt", () => {
  it("Quelle und Bestätigung", () => {
    expect(isGuestCountUnconfirmed({ guestCountUnknown: true, guestCountManual: false })).toBe(true);
    expect(isGuestCountUnconfirmed({ guestCountUnknown: true, guestCountManual: true })).toBe(false);
    expect(isGuestCountUnconfirmed({ guestCountUnknown: false, guestCountManual: false })).toBe(false);
    expect(guestCountSource({ guestCountUnknown: true })).toBe("unbekannt");
    expect(guestCountSource({ guestCountManual: true, guestCountSource: "email" })).toBe("portal_mail");
    expect(guestCountSource({ guestCountManual: true, guestCountSource: "manual" })).toBe("von_hand");
    expect(guestCountSource({})).toBe("smoobu");
  });

  it("Smoobu ohne (oder mit 0) adults → unbekannt, mit adults → bekannt", async () => {
    process.env.SMOOBU_API_KEY = "k";
    const base = { arrival: "2026-11-10", departure: "2026-11-12", "guest-name": "X", apartment: { id: 102 }, channel: { name: "Booking.com" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      page_count: 1,
      bookings: [{ id: 1, ...base }, { id: 2, ...base, adults: 0 }, { id: 3, ...base, adults: 3, children: 1 }],
    }), { status: 200 }));
    const r = await new SmoobuAdapter().fetchReservations({ from: "2026-11-01", to: "2026-11-30" });
    expect(r.map((x) => [x.guestCount, x.guestCountUnknown])).toEqual([[1, true], [1, true], [4, false]]);
  });

  it("Push je Buchung einmal (≤ 30 Tage), Klärung von Hand beendet die Warnung", async () => {
    const r1 = await runReminders(world.org.id);
    expect(r1.guestCountReminders).toBe(1);
    expect(gcPushes()).toHaveLength(1);
    expect(gcPushes()[0]).toMatchObject({ roles: ["ADMIN", "MANAGER"], title: "⚠️ Gästezahl unbekannt", url: `/bookings/${world.bookings.b5.id}` });
    expect(gcPushes()[0]!.body).toMatch(/Penthouse 1\.11\./);

    expect((await runReminders(world.org.id)).guestCountReminders).toBe(0);
    expect(gcPushes()).toHaveLength(1);

    const offen = await call("gaestezahl_offen");
    expect(offen.result.anzahl).toBe(1);
    expect(offen.result.buchungen[0]).toMatchObject({ buchung_id: world.bookings.b5.id, kanal: "Booking.com", push_gemeldet: true });

    const liste = await call("buchungen_list", { von: "2026-11-01", bis: "2026-11-01" });
    const eva = liste.result.eintraege.find((e: any) => e.id === world.bookings.b5.id);
    expect(eva).toMatchObject({ gaestezahl_quelle: "unbekannt", gaestezahl_bestaetigt: false });

    await setGuestCount({ organizationId: world.org.id, bookingId: world.bookings.b5.id, guestCount: 5, actor: { userId: world.admin.id } });
    expect((await call("gaestezahl_offen")).result.anzahl).toBe(0);
    const liste2 = await call("buchungen_list", { von: "2026-11-01", bis: "2026-11-01" });
    expect(liste2.result.eintraege.find((e: any) => e.id === world.bookings.b5.id)).toMatchObject({ gaestezahl_quelle: "von_hand", gaestezahl_bestaetigt: true });
  });

  it("Anreise in mehr als 30 Tagen: noch kein Push", async () => {
    await prisma.booking.update({ where: { id: world.bookings.b5.id }, data: { checkIn: new Date("2026-12-15T00:00:00Z"), checkOut: new Date("2026-12-18T00:00:00Z") } });
    expect((await runReminders(world.org.id)).guestCountReminders).toBe(0);
  });

  it("Tagesstatus nennt unbestätigte Gästezahlen", async () => {
    vi.setSystemTime(new Date("2026-10-30T07:30:00Z"));
    expect(await maybeSendDailyStatus(world.org.id)).toBe(true);
    const status = pushes.find((p) => p.title.startsWith("Heute"));
    expect(status!.body).toMatch(/Gästezahl unbekannt: 1 Buchung/);
  });

  it("Wäsche-Warnung sagt, dass sie unbestätigte Gästezahlen enthält (volle Belegung angenommen)", async () => {
    await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { laundryBeds: [{ width: 200, persons: 2 }, { width: 180, persons: 2 }, { width: 90, persons: 1 }] } });
    const few = Object.fromEntries(Object.keys(DEFAULT_RESERVE).map((k) => [k, 1]));
    await prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: new Date("2026-10-29T00:00:00Z"), quantities: few } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    const w = pushes.find((p) => p.title.includes("Wäsche"))!;
    expect(w.body).toMatch(/enthält eine unbestätigte Gästezahl/);
  });
});
