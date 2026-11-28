import { describe, it, expect, beforeEach, vi } from "vitest";

// Neue Gästenachricht sofort per Smoobu-Webhook `newMessage` (Mathias 28.11.2026).
const pushes = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, _r: string[], p: { title: string; body: string }) => { pushes.push(p); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));
vi.mock("@/lib/guest-messages", async (orig) => {
  const actual = await orig<typeof import("@/lib/guest-messages")>();
  return { ...actual, fetchGuestMessages: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { fetchGuestMessages } from "@/lib/guest-messages";
import { handleNewMessage, parseNewMessage } from "@/lib/guest-message-webhook";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
const msg = (id: string, von: "gast" | "gastgeber") => ({ id, von, text: `Nachricht ${id}`, betreff: null, zeit: null });

beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  await prisma.booking.update({ where: { id: world.bookings.b2.id }, data: { smoobuId: 4711 } });
  pushes.length = 0;
  vi.mocked(fetchGuestMessages).mockReset();
  vi.mocked(fetchGuestMessages).mockResolvedValue({ messages: [msg("900", "gastgeber"), msg("901", "gast")], complete: true });
});

describe("Smoobu-Webhook newMessage", () => {
  it("liest den Rumpf laut Smoobu-Doku", () => {
    expect(parseNewMessage({ action: "newMessage", user: 1, data: { id: 901, sender: "guest", booking: { id: 4711 } } }))
      .toEqual({ smoobuBookingId: 4711, messageId: "901", sender: "guest" });
    expect(parseNewMessage({ action: "updateReservation", data: { id: 4711 } })).toBeNull();
    expect(parseNewMessage("kein json")).toBeNull();
  });

  it("meldet eine Gastnachricht sofort – ohne Gastnamen und ohne Text", async () => {
    const r = await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 4711, messageId: "901", sender: "guest" });
    expect(r).toEqual({ handled: "notified", bookingId: world.bookings.b2.id });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.title).toBe("💬 Neue Gästenachricht");
    expect(pushes[0]!.body).toContain("Lodge No. 17");
    expect(pushes[0]!.body).not.toContain("Bernd");
    expect(pushes[0]!.body).not.toContain("Nachricht 901");
    const seen = await prisma.guestMessageSeen.findMany({ where: { bookingId: world.bookings.b2.id } });
    expect(seen.map((s) => s.messageId).sort()).toEqual(["900", "901"]);
    const audit = await prisma.auditLog.findFirst({ where: { action: "guest.message.received" } });
    expect(JSON.stringify(audit?.details)).not.toContain("Nachricht");
  });

  it("derselbe Webhook zweimal → nur eine Meldung", async () => {
    await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 4711, messageId: "901", sender: "guest" });
    const r = await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 4711, messageId: "901", sender: "guest" });
    expect(r.handled).toBe("duplicate");
    expect(pushes).toHaveLength(1);
  });

  it("eigene Antwort und unbekannte Buchung melden nichts", async () => {
    expect((await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 4711, messageId: "902", sender: "host" })).handled).toBe("host_reply");
    expect((await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 999, messageId: "903", sender: "guest" })).handled).toBe("unknown_booking");
    expect(pushes).toHaveLength(0);
  });

  it("Smoobu kurz nicht erreichbar → Meldung kommt trotzdem", async () => {
    vi.mocked(fetchGuestMessages).mockRejectedValue(new Error("Smoobu down"));
    const r = await handleNewMessage({ organizationId: world.org.id, smoobuBookingId: 4711, messageId: "904", sender: "guest" });
    expect(r.handled).toBe("notified");
    expect(pushes).toHaveLength(1);
  });
});
