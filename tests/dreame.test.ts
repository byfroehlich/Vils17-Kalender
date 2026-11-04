import { describe, it, expect, beforeEach, vi } from "vitest";

const pushes = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, _r: string[], p: { title: string; body: string }) => { pushes.push(p); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));

import { prisma } from "@/lib/prisma";
import { runDreame, type DreameClient } from "@/lib/dreame-runner";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
// Penthouse-Abreise b4: 12.10.2026 (Sommerzeit, 10:00 Wien = 08:00 UTC)
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00+02:00`);

function fakeClient(states: number[] = [], failStart = false) {
  const calls = { start: 0, status: 0 };
  const client: DreameClient = {
    async start() { calls.start++; if (failStart) throw new Error("offline"); },
    async status() { calls.status++; return states.shift() ?? 1; },
  };
  return { client, calls };
}

const assignment = () => prisma.cleaningAssignment.findFirstOrThrow({ where: { bookingId: world.bookings.b4.id } });

beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { dreameEnabled: true } });
  pushes.length = 0;
});

describe("Saugroboter am Abreisetag", () => {
  it("vor 10:00 passiert nichts", async () => {
    const f = fakeClient();
    const r = await runDreame({ organizationId: world.org.id, now: at("09:55"), client: f.client });
    expect(r[0]).toMatchObject({ action: "skipped", reason: "vor 10:00" });
    expect(f.calls.start).toBe(0);
  });

  it("ab 10:00 genau einmal starten, dann überwachen und fertig melden", async () => {
    const f = fakeClient([1, 6]);
    await runDreame({ organizationId: world.org.id, now: at("10:00"), client: f.client });
    expect(f.calls.start).toBe(1);
    expect((await assignment()).dreameStartedAt).not.toBeNull();
    expect(pushes.map((p) => p.title)).toEqual(["🤖 Saugroboter gestartet"]);

    // zweiter Lauf: läuft noch, kein zweiter Start
    const r2 = await runDreame({ organizationId: world.org.id, now: at("10:15"), client: f.client });
    expect(r2[0]).toMatchObject({ action: "running" });
    expect(f.calls.start).toBe(1);

    // dritter Lauf: lädt → fertig
    await runDreame({ organizationId: world.org.id, now: at("10:45"), client: f.client });
    expect((await assignment()).dreameDoneAt).not.toBeNull();
    expect(pushes.at(-1)?.title).toBe("✅ Saugroboter fertig");

    // danach Ruhe
    const r4 = await runDreame({ organizationId: world.org.id, now: at("11:00"), client: f.client });
    expect(r4[0]).toMatchObject({ action: "skipped", reason: "heute schon fertig" });
  });

  it("Startfehler: Warnung genau einmal, neuer Versuch beim nächsten Lauf", async () => {
    const f = fakeClient([], true);
    await runDreame({ organizationId: world.org.id, now: at("10:00"), client: f.client });
    await runDreame({ organizationId: world.org.id, now: at("10:15"), client: f.client });
    expect(f.calls.start).toBe(2);
    const warnings = pushes.filter((p) => p.title.includes("⚠️"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.body).toContain("Start fehlgeschlagen");
  });

  it("Störung und zu lange Laufzeit werden gemeldet", async () => {
    const f = fakeClient([4]);
    await runDreame({ organizationId: world.org.id, now: at("10:00"), client: f.client });
    await runDreame({ organizationId: world.org.id, now: at("10:30"), client: f.client });
    expect(pushes.at(-1)?.body).toContain("Störung");
  });

  it("ohne Zugangsdaten: Warnung statt Absturz", async () => {
    const r = await runDreame({ organizationId: world.org.id, now: at("10:00"), client: null });
    expect(r[0]).toMatchObject({ action: "warned" });
  });

  it("Wohnung ohne Roboter und Tage ohne Abreise bleiben unberührt", async () => {
    await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { dreameEnabled: false } });
    expect(await runDreame({ organizationId: world.org.id, now: at("10:00"), client: fakeClient().client })).toEqual([]);
    await prisma.apartment.update({ where: { id: world.penthouse.id }, data: { dreameEnabled: true } });
    const r = await runDreame({ organizationId: world.org.id, now: new Date("2026-10-13T10:00:00+02:00"), client: fakeClient().client });
    expect(r[0]).toMatchObject({ action: "skipped", reason: "keine Abreise heute" });
  });
});
