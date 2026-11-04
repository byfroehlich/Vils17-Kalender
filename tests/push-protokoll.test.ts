import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers, listPushLog } from "@/lib/push";
import { resetDb, seedWorld } from "./fixtures";

// Versandprotokoll (Entscheidung Mathias 01.11.2026): jeder Versand landet je Person im Protokoll — auch wenn
// kein Gerät angemeldet ist oder Push nicht eingerichtet ist. Nur Titel, kein Nachrichtentext.
let world: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
});

describe("Push-Versandprotokoll", () => {
  it("schreibt je Empfänger eine Zeile mit Titel und Grund, nie den Text", async () => {
    const users = await prisma.user.findMany({ where: { organizationId: world.org.id }, take: 2, select: { id: true } });
    await sendPushToUsers(users.map((u) => u.id), { title: "🔔 Test", body: "Geheimer Text mit Gastname" });
    const log = await listPushLog(world.org.id);
    expect(log).toHaveLength(users.length);
    for (const r of log) {
      expect(r.title).toBe("🔔 Test");
      expect(r.sent).toBe(0);
      expect(r.error).toBeTruthy();
      expect(JSON.stringify(r)).not.toContain("Geheimer Text");
    }
  });
});
