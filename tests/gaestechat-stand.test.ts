import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedWorld } from "./fixtures";

vi.mock("@/lib/guest-messages", async (orig) => {
  const actual = await orig<typeof import("@/lib/guest-messages")>();
  return { ...actual, fetchGuestMessages: vi.fn() };
});
import { fetchGuestMessages } from "@/lib/guest-messages";
import { findUnansweredChats, markChatDone, readOpenChats, refreshOpenChats } from "@/lib/guest-chat-overview";
import { loadTodos } from "@/lib/todo";

// Entscheidung Mathias 04.11.2026: Übersicht, Gäste-Seite, MCP und Zentrale zeigen denselben Stand.
let world: Awaited<ReturnType<typeof seedWorld>>;
const msg = (id: string, von: "gast" | "gastgeber") => ({ id, von, text: `Nachricht ${id}`, betreff: null, zeit: null });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  await resetDb();
  world = await seedWorld();
  await prisma.booking.updateMany({ where: { organizationId: world.org.id }, data: { smoobuId: null } });
  await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 4711 } });
  vi.mocked(fetchGuestMessages).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Gemeinsamer Stand der Gästechats", () => {
  it("Prüfung speichert den Stand, Erledigt nimmt ihn sofort heraus", async () => {
    vi.mocked(fetchGuestMessages).mockResolvedValue({ messages: [msg("1", "gastgeber"), msg("2", "gast")] } as never);
    await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    let stand = await readOpenChats(world.org.id);
    expect(stand?.items.map((c) => c.messageId)).toEqual(["2"]);

    await markChatDone({ organizationId: world.org.id, bookingId: world.bookings.b2.id, messageId: "2", actor: {} });
    stand = await readOpenChats(world.org.id);
    expect(stand?.items).toEqual([]);
  });

  it("Übersicht liest den frischen Stand ohne Smoobu zu fragen", async () => {
    vi.mocked(fetchGuestMessages).mockResolvedValue({ messages: [msg("2", "gast")] } as never);
    await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    vi.mocked(fetchGuestMessages).mockClear();

    const r = await loadTodos(world.org.id);
    expect(fetchGuestMessages).not.toHaveBeenCalled();
    expect(r.chatsUnchecked).toBe(false);
    expect(r.items.filter((i) => i.kind === "chat")).toHaveLength(1);
  });

  it("Smoobu nicht erreichbar → letzter Stand gilt, kein „nicht geprüft“", async () => {
    vi.mocked(fetchGuestMessages).mockResolvedValue({ messages: [msg("2", "gast")] } as never);
    await findUnansweredChats({ organizationId: world.org.id, days: 30 });
    vi.setSystemTime(new Date("2026-10-30T09:00:00Z")); // Stand ist jetzt alt
    vi.mocked(fetchGuestMessages).mockRejectedValue(new Error("Smoobu down"));

    const r = await loadTodos(world.org.id);
    expect(r.chatsUnchecked).toBe(false);
    expect(r.items.filter((i) => i.kind === "chat")).toHaveLength(1);
  });

  it("App-Takt erneuert nur, wenn der Stand älter als 10 Minuten ist", async () => {
    vi.mocked(fetchGuestMessages).mockResolvedValue({ messages: [msg("2", "gast")] } as never);
    expect((await refreshOpenChats(world.org.id)).refreshed).toBe(true);
    expect((await refreshOpenChats(world.org.id)).refreshed).toBe(false);
    vi.setSystemTime(new Date("2026-10-30T08:11:00Z"));
    expect((await refreshOpenChats(world.org.id)).refreshed).toBe(true);
  });
});
