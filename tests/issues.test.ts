import { describe, it, expect, beforeEach, vi } from "vitest";

const pushes = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, _r: string[], p: { title: string; body: string }) => { pushes.push(p); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));

import { prisma } from "@/lib/prisma";
import { recordCleaningCheck, listIssues, checkSchema, parsePhoto, IssueError } from "@/lib/issues";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;
beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  ctx = { organizationId: world.org.id, tokenId: "t", tokenName: "Claude", scopes: [...SCOPES] };
  pushes.length = 0;
});

describe("Pflicht-Check beim Erledigen", () => {
  it("Fragen müssen beantwortet und bei „nein“ beschrieben werden", () => {
    expect(checkSchema.safeParse({ inventoryOk: true, suppliesOk: true }).success).toBe(true);
    expect(checkSchema.safeParse({ inventoryOk: false, suppliesOk: true }).success).toBe(false);
    expect(checkSchema.safeParse({ inventoryOk: true, suppliesOk: false }).success).toBe(false);
    expect(checkSchema.safeParse({ inventoryOk: true }).success).toBe(false);
  });

  it("Schaden hängt am Aufenthalt davor, Airbnb-Frist 14 Tage, Push an Admin", async () => {
    // b5 (Penthouse, Anreise 01.11.) — davor b4 (Airbnb, Abreise 12.10.)
    const r = await recordCleaningCheck({
      organizationId: world.org.id, bookingId: world.bookings.b5.id,
      check: { inventoryOk: false, damage: "Klappcouch: Mechanismus links gebrochen", suppliesOk: false, supplies: "Allzweckreiniger, Müllbeutel" },
      actor: { name: "Vanessa" },
    });
    expect(r.created).toBe(2);
    const open = await listIssues(world.org.id, { open: true });
    const dmg = open.find((i) => i.kind === "DAMAGE")!;
    expect(dmg.previous?.id).toBe(world.bookings.b4.id);
    expect(dmg.claimDeadline).toBe("2026-10-26");
    expect(open.find((i) => i.kind === "SUPPLY")?.text).toContain("Müllbeutel");
    expect(pushes.map((p) => p.title)).toEqual(["⚠️ Schaden gemeldet", "🧴 Nachkaufen"]);
    expect(pushes[0]!.body).toContain("Vanessa");
    const a = await prisma.cleaningAssignment.findFirstOrThrow({ where: { bookingId: world.bookings.b5.id } });
    expect(a.checkedAt).not.toBeNull();
  });

  it("alles in Ordnung → kein Eintrag, kein Push", async () => {
    const r = await recordCleaningCheck({ organizationId: world.org.id, bookingId: world.bookings.b5.id, check: { inventoryOk: true, suppliesOk: true }, actor: {} });
    expect(r.created).toBe(0);
    expect(pushes).toHaveLength(0);
  });

  it("Foto: nur Bilder, Größenlimit", () => {
    expect(parsePhoto("data:image/jpeg;base64,/9j/AAAA")?.photoType).toBe("image/jpeg");
    expect(() => parsePhoto("data:text/html;base64,PGh0bWw+")).toThrow(IssueError);
  });
});

describe("MCP maengel / mangel_erfassen", () => {
  it("eintragen mit Vorschau, listen, erledigen", async () => {
    const pre = await runTool(findTool("mangel_erfassen")!, { wohnung: "Penthouse", art: "schaden", text: "Mülleimerdeckel gerissen" }, ctx) as { result: any };
    expect(pre.result.vorschau).toBe(true);
    const ok = await runTool(findTool("mangel_erfassen")!, { wohnung: "Penthouse", art: "schaden", text: "Mülleimerdeckel gerissen", bestaetigt: true }, ctx) as { result: any };
    const list = await runTool(findTool("maengel")!, {}, ctx) as { result: any };
    expect(list.result.offen[0]).toMatchObject({ art: "Schaden", text: "Mülleimerdeckel gerissen" });
    await runTool(findTool("mangel_erfassen")!, { id: ok.result.id, erledigt: true, bestaetigt: true }, ctx);
    const after = await runTool(findTool("maengel")!, {}, ctx) as { result: any };
    expect(after.result.offen).toHaveLength(0);
  });
});
