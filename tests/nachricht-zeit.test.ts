import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, seedWorld } from "./fixtures";
import { recordSeen, formatMessageTime } from "@/lib/message-seen";

let world: Awaited<ReturnType<typeof seedWorld>>;
const m = (id: string, zeit: string | null = null) => ({ id, von: "gast" as const, betreff: null, text: id, zeit });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
});
afterEach(() => vi.useRealTimers());

describe("Zeitpunkt von Gästenachrichten", () => {
  it("erster Abruf: Zeit unbekannt; spätere neue Nachricht: zuerst gesehen", async () => {
    const b = world.bookings.b2.id;
    let t = await recordSeen(world.org.id, b, [m("1")]);
    expect(t.get("1")).toEqual({ at: null, approx: true });
    expect(formatMessageTime(t.get("1"))).toBe("Zeit unbekannt (älter)");

    vi.setSystemTime(new Date("2026-10-31T09:12:00Z"));
    t = await recordSeen(world.org.id, b, [m("1"), m("2")]);
    expect(t.get("2")!.at!.toISOString()).toBe("2026-10-31T09:12:00.000Z");
    expect(formatMessageTime(t.get("2"))).toBe("eingegangen spätestens Sa. 31.10. 10:12");
  });

  it("liefert Smoobu einen Zeitpunkt, gilt der", async () => {
    const t = await recordSeen(world.org.id, world.bookings.b2.id, [m("5", "2026-10-31T06:30:00.000Z")]);
    expect(formatMessageTime(t.get("5"))).toBe("eingegangen Sa. 31.10. 07:30");
  });
});
