import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const pushes = vi.hoisted(() => [] as { roles: string[]; title: string; body: string; url?: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, roles: string[], p: { title: string; body: string; url?: string }) => { pushes.push({ roles, ...p }); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));

import { prisma } from "@/lib/prisma";
import { runReminders, maybeSendDailyStatus, maybeSendLaundryAlert } from "@/lib/notifications";
import { DEFAULT_RESERVE } from "@/lib/laundry-order";
import { resetDb, seedWorld } from "./fixtures";

// Wäsche nach Bestand statt pro Buchung (Entscheidung Mathias 31.10.2026)

let world: Awaited<ReturnType<typeof seedWorld>>;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const laundryPushes = () => pushes.filter((p) => p.title.includes("Wäsche"));
const plenty = Object.fromEntries(Object.keys(DEFAULT_RESERVE).map((k) => [k, 100]));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z")); // 09:00 in Wien
  await resetDb();
  world = await seedWorld();
  pushes.length = 0;
});

afterEach(() => vi.useRealTimers());

describe("Wäsche-Warnung nach Bestand", () => {
  it("keine Warnung pro Buchung — offene laundryStatus lösen nichts aus, ohne Bestand keine Meldung", async () => {
    const r = await runReminders(world.org.id);
    expect(r.laundryReminders).toBe(0);
    expect(laundryPushes()).toHaveLength(0);
    // Buchungsbezogene Wäsche-Markierung bleibt unberührt
    expect(await prisma.cleaningAssignment.count({ where: { laundryReminderSentAt: { not: null } } })).toBe(0);
  });

  // Handtücher-Bedarf bis 12.11.: b2 Lodge 4 P. × 2 + b5 Penthouse 5 P. × 1 + b3 Lodge 3 P. × 2 = 19, Reserve 3
  const countTowels = (towels: number) =>
    prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: d("2026-10-29"), quantities: { ...plenty, towels } } });
  const book = (o: { ci: string; co: string; n: number; apt?: string; unknown?: boolean; guest?: string }) =>
    prisma.booking.create({
      data: {
        organizationId: world.org.id, apartmentId: o.apt ?? world.penthouse.id, guestName: o.guest ?? "Neu Gast", guestCount: o.n,
        checkIn: d(o.ci), checkOut: d(o.co), status: "confirmed", guestCountUnknown: o.unknown ?? false,
      },
    });

  it("neue Buchung erzeugt Engpass → Meldung mit Tag, Wohnung, Gästen; gleiche Lage → keine Wiederholung", async () => {
    await countTowels(22); // reicht genau inkl. Reserve
    expect((await runReminders(world.org.id)).laundryReminders).toBe(0);
    expect(laundryPushes()).toHaveLength(0);

    await book({ ci: "2026-11-07", co: "2026-11-09", n: 2 });
    const r1 = await runReminders(world.org.id);
    expect(r1.laundryReminders).toBe(1);
    expect(laundryPushes()).toHaveLength(1);
    const p = laundryPushes()[0]!;
    expect(p.roles).toEqual(["ADMIN", "MANAGER"]);
    expect(p.title).toBe("🧺 Wäsche reicht nicht ab Sa 07.11. (Penthouse, 2 Gäste)");
    expect(p.body).toMatch(/^fehlt: .*2 große Handtücher.* – Jetzt bestellen$/);
    expect(p.url).toBe("/laundry");

    // App-Takt alle 5 Min, gleiche Daten: keine Wiederholung — auch nicht am nächsten Tag
    expect((await runReminders(world.org.id)).laundryReminders).toBe(0);
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
    expect(laundryPushes()).toHaveLength(1);
  });

  it("Storno löscht die Lage; ein anderer, kurzfristiger Engpass meldet sich wieder", async () => {
    await countTowels(22);
    const extra = await book({ ci: "2026-11-07", co: "2026-11-09", n: 2 });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: world.org.id } })).laundryAlertKey).not.toBeNull();

    await prisma.booking.update({ where: { id: extra.id }, data: { status: "cancelled" } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: world.org.id } })).laundryAlertKey).toBeNull();

    // gleiche Buchung wieder da → wieder eine Meldung (Lage war zwischendurch entspannt)
    await prisma.booking.update({ where: { id: extra.id }, data: { status: "confirmed" } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    expect(laundryPushes()).toHaveLength(2);

    // zusätzlich kurzfristige Buchung morgen → andere Lage → neue Meldung, als kurzfristig markiert
    await book({ ci: "2026-10-31", co: "2026-11-01", n: 12 });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    const p = laundryPushes()[2]!;
    expect(p.title).toBe("⚠️ Kurzfristig: Wäsche reicht nicht ab Sa 31.10. (Penthouse, 12 Gäste)");
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
    expect(laundryPushes()).toHaveLength(3);
  });

  it("andere Gästezahl ändert die Lage → neue Meldung", async () => {
    await countTowels(22);
    const extra = await book({ ci: "2026-11-07", co: "2026-11-09", n: 2 });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    await prisma.booking.update({ where: { id: extra.id }, data: { guestCount: 3 } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    expect(laundryPushes()[1]!.title).toMatch(/Penthouse, 3 Gäste/);
  });

  it("unbekannte Gästezahl (Booking.com): Planung mit voller Belegung der Wohnung", async () => {
    await prisma.apartment.update({
      where: { id: world.penthouse.id },
      data: { laundryBeds: [{ width: 200, persons: 2 }, { width: 180, persons: 2 }, { width: 90, persons: 1 }] },
    });
    await countTowels(23); // reicht für 1 Gast, nicht für 5
    await book({ ci: "2026-11-07", co: "2026-11-09", n: 1, unknown: true });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
    expect(laundryPushes()[0]!.title).toBe("🧺 Wäsche reicht nicht ab Sa 07.11. (Penthouse, 5 Gäste angenommen)");
  });

  it("von Hand korrigierte Gästezahl gilt, auch wenn Smoobu keine geliefert hat", async () => {
    await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { laundryBeds: [{ width: 200, persons: 2 }, { width: 180, persons: 2 }] } });
    await countTowels(23);
    const b = await book({ ci: "2026-11-07", co: "2026-11-09", n: 1, unknown: true });
    await prisma.booking.update({ where: { id: b.id }, data: { guestCountManual: true, guestCountSource: "manual" } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
  });

  it("Bestand reicht → keine Meldung; nachts nie", async () => {
    await prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: d("2026-10-29"), quantities: plenty } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);

    await prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: d("2026-10-29"), quantities: { ...plenty, bathMats: 0 } } });
    vi.setSystemTime(new Date("2026-10-30T22:30:00Z")); // 23:30 in Wien
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
    expect(laundryPushes()).toHaveLength(0);
    // ab 7 Uhr kommt die Meldung nach
    vi.setSystemTime(new Date("2026-10-31T06:30:00Z"));
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(true);
  });

  it("bestellte, noch nicht angekommene Lieferung deckt die Bestellmenge — keine Meldung", async () => {
    await prisma.laundryCount.create({ data: { organizationId: world.org.id, countedOn: d("2026-10-29"), quantities: { ...plenty, towels: 0 } } });
    // Lieferung heute, noch unterwegs, deckt den Handtuch-Bedarf
    await prisma.laundryDelivery.create({ data: { organizationId: world.org.id, deliveryOn: d("2026-10-30"), quantities: { towels: 40 } } });
    expect(await maybeSendLaundryAlert(world.org.id)).toBe(false);
  });

  it("Tagesstatus enthält keine „Wäsche offen“-Zeile mehr", async () => {
    vi.setSystemTime(new Date("2026-10-30T07:30:00Z")); // 08:30 in Wien, b2 reist heute an
    expect(await maybeSendDailyStatus(world.org.id)).toBe(true);
    const status = pushes.find((p) => p.title.startsWith("Heute"));
    expect(status).toBeDefined();
    expect(status!.body).not.toMatch(/Wäsche/);
  });
});
