import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedWorld } from "./fixtures";

vi.mock("@/lib/guest-messages", async (orig) => {
  const actual = await orig<typeof import("@/lib/guest-messages")>();
  return { ...actual, fetchGuestMessages: vi.fn() };
});
import { fetchGuestMessages } from "@/lib/guest-messages";
import { findUnansweredChats, markChatDone } from "@/lib/guest-chat-overview";

let world: Awaited<ReturnType<typeof seedWorld>>;
const msg = (id: string, von: "gast" | "gastgeber") => ({ id, von, text: `Nachricht ${id}`, betreff: null, zeit: null });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
});
afterEach(() => vi.useRealTimers());

describe("Gästechat erledigt", () => {
  it("blendet den Chat aus, bis der Gast erneut schreibt", async () => {
    await prisma.booking.updateMany({ where: { organizationId: world.org.id }, data: { smoobuId: null } });
    await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 4711 } });
    const fetchMock = vi.mocked(fetchGuestMessages);

    fetchMock.mockResolvedValue({ messages: [msg("1", "gastgeber"), msg("2", "gast")] } as never);
    let r = await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    expect(r.open.map((o) => o.last.id)).toEqual(["2"]);

    await markChatDone({ organizationId: world.org.id, bookingId: world.bookings.b2.id, messageId: "2", actor: {} });
    r = await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    expect(r.open).toEqual([]);

    fetchMock.mockResolvedValue({ messages: [msg("1", "gastgeber"), msg("2", "gast"), msg("3", "gast")] } as never);
    r = await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    expect(r.open.map((o) => o.last.id)).toEqual(["3"]);
  });

  it("fremde Organisation → nicht gefunden", async () => {
    const other = await prisma.organization.create({ data: { name: "X", slug: "x" } });
    await expect(markChatDone({ organizationId: other.id, bookingId: world.bookings.b2.id, messageId: "2", actor: {} })).rejects.toThrow("nicht gefunden");
  });
});
