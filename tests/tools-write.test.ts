import { describe, it, expect, beforeEach, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string }[], pushes: [] as string[][] }));
vi.mock("@/lib/mail", () => ({
  sendCleaningAssignmentMail: vi.fn(async (p: { to: string }) => { sent.mails.push(p); }),
}));
vi.mock("@/lib/push", () => ({
  sendPushToUsers: vi.fn(async (ids: string[]) => { sent.pushes.push(ids); return { notConfigured: false, devices: 1, sent: 1, failed: 0, removed: 0 }; }),
  sendPushToRole: vi.fn(async () => undefined),
}));
const syncCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/sync", () => ({
  syncBookings: vi.fn(async () => { syncCalls.n++; return { created: 0, updated: 0, cancelled: 0, apartmentsImported: 0 }; }),
}));

import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { money } from "@/lib/mcp/format";
import { resetDb, seedWorld } from "./fixtures";

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;

async function call(name: string, args: Record<string, unknown> = {}, c: ToolContext = ctx) {
  return runTool(findTool(name)!, args, c) as Promise<{ ok: boolean; result: any }>;
}

beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  ctx = { organizationId: world.org.id, tokenId: "tok1", tokenName: "Claude Desktop", scopes: [...SCOPES] };
  sent.mails = [];
  sent.pushes = [];
  syncCalls.n = 0;
});

describe("reinigung_zuweisen", () => {
  it("ohne bestaetigt: nur Vorschau, nichts geändert", async () => {
    const id = world.bookings.b5.id; // abgesagt von Vanessa
    const r = await call("reinigung_zuweisen", { buchung_id: id, reinigungskraft: "Kerstin" });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ vorschau: true, ausgefuehrt: false, vorher: "offen — abgesagt von Vanessa", nachher: "zugewiesen an Kerstin" });
    expect(r.result.wuerde_passieren).toMatch(/Kerstin wird benachrichtigt/);
    const a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a.status).toBe("UNASSIGNED");
    expect(sent.mails).toHaveLength(0);
    expect(sent.pushes).toHaveLength(0);
  });

  it("mit bestaetigt: weist zu — gleiche Regeln wie die App, inkl. Benachrichtigung", async () => {
    const id = world.bookings.b5.id;
    const r = await call("reinigung_zuweisen", { buchung_id: id, reinigungskraft: "kerst", bestaetigt: true });
    expect(r.result).toMatchObject({ ausgefuehrt: true, nachher: "zugewiesen an Kerstin", benachrichtigt: true });
    const a = await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } });
    expect(a).toMatchObject({ status: "ASSIGNED", cleanerId: world.kerstin.id, cleanerUnavailable: false });
    // Absage-Historie bleibt (Vanessa sieht „übernommen von Kerstin“) — Regel aus der App
    expect(a.declinedById).toBe(world.vanessa.id);
    expect(sent.pushes).toEqual([[world.kerstin.id]]);
    expect(sent.mails.map((m) => m.to)).toEqual(["k@test.at"]);
  });

  it("schreibt Audit mit Ziel-ID und dem App-Eintrag", async () => {
    const id = world.bookings.b5.id;
    await call("reinigung_zuweisen", { buchung_id: id, reinigungskraft: "Kerstin" });
    await call("reinigung_zuweisen", { buchung_id: id, reinigungskraft: "Kerstin", bestaetigt: true });
    const mcp = await prisma.auditLog.findMany({ where: { action: "mcp.reinigung_zuweisen" }, orderBy: { createdAt: "asc" } });
    expect(mcp.map((l) => (l.details as any).status)).toEqual(["vorschau", "ok"]);
    expect(mcp[1]).toMatchObject({ entityType: "Booking", entityId: id });
    expect((mcp[1].details as any).token).toBe("Claude Desktop");
    const app = await prisma.auditLog.findFirstOrThrow({ where: { action: "assignment.created" } });
    expect((app.details as any).via).toBe("mcp:Claude Desktop");
  });

  it("meldet unbekannte Reinigungskraft und bereits Zugewiesenes", async () => {
    const r = await call("reinigung_zuweisen", { buchung_id: world.bookings.b5.id, reinigungskraft: "Paula" });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/Vanessa, Kerstin|Kerstin, Vanessa/);
    const same = await call("reinigung_zuweisen", { buchung_id: world.bookings.b2.id, reinigungskraft: "Kerstin", bestaetigt: true });
    expect(same.result).toMatchObject({ ausgefuehrt: false, unveraendert: true });
  });

  it("braucht cleaning:write", async () => {
    const r = await call("reinigung_zuweisen", { buchung_id: world.bookings.b5.id, reinigungskraft: "Kerstin", bestaetigt: true }, { ...ctx, scopes: ["cleaning:read"] });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/cleaning:write/);
  });
});

describe("buchung_notiz", () => {
  it("Vorschau, dann setzen und wieder entfernen", async () => {
    const id = world.bookings.b3.id;
    const p = await call("buchung_notiz", { buchung_id: id, notiz: "Kinderbett aufbauen" });
    expect(p.result).toMatchObject({ vorschau: true, notiz_vorher: null, notiz_nachher: "Kinderbett aufbauen" });
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } })).notes).toBeNull();

    await call("buchung_notiz", { buchung_id: id, notiz: "Kinderbett aufbauen", bestaetigt: true });
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } })).notes).toBe("Kinderbett aufbauen");

    await call("buchung_notiz", { buchung_id: id, notiz: "  ", bestaetigt: true });
    expect((await prisma.cleaningAssignment.findUniqueOrThrow({ where: { bookingId: id } })).notes).toBeNull();
  });

  it("schreibt den Notiztext nicht ins Audit", async () => {
    await call("buchung_notiz", { buchung_id: world.bookings.b3.id, notiz: "Frau Wolf kommt mit Hund", bestaetigt: true });
    const logs = await prisma.auditLog.findMany();
    expect(JSON.stringify(logs)).not.toContain("Frau Wolf");
  });
});

describe("gaestezahl_korrigieren", () => {
  it("setzt guestCountManual und Herkunft manual, Aufheben setzt zurück", async () => {
    const id = world.bookings.b5.id;
    const p = await call("gaestezahl_korrigieren", { buchung_id: id, gaeste: 4 });
    expect(p.result).toMatchObject({ vorschau: true, vorher: 5, nachher: 4 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).guestCount).toBe(5);

    await call("gaestezahl_korrigieren", { buchung_id: id, gaeste: 4, bestaetigt: true });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id } })).toMatchObject({ guestCount: 4, guestCountManual: true, guestCountSource: "manual" });

    await call("gaestezahl_korrigieren", { buchung_id: id, gaeste: null, bestaetigt: true });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id } })).toMatchObject({ guestCountManual: false, guestCountSource: null });
  });

  it("eine Handkorrektur nach einem Mail-Import gilt wieder als manuell", async () => {
    const id = world.bookings.b5.id;
    await prisma.booking.update({ where: { id }, data: { guestCount: 6, guestCountManual: true, guestCountSource: "email" } });
    await call("gaestezahl_korrigieren", { buchung_id: id, gaeste: 4, bestaetigt: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).guestCountSource).toBe("manual");
  });
});

describe("sync_ausloesen", () => {
  it("Vorschau; nur synchronisieren, wenn älter als 10 Minuten — oder erzwungen", async () => {
    await prisma.organization.update({ where: { id: world.org.id }, data: { lastSyncAt: new Date() } });
    const p = await call("sync_ausloesen");
    expect(p.result.vorschau).toBe(true);
    expect(p.result.wuerde_passieren).toMatch(/Nichts zu tun/);
    expect(syncCalls.n).toBe(0);

    const skipped = await call("sync_ausloesen", { bestaetigt: true });
    expect(skipped.result.ausgefuehrt).toBe(false);
    expect(syncCalls.n).toBe(0);

    const forced = await call("sync_ausloesen", { erzwingen: true, bestaetigt: true });
    expect(forced.result.ausgefuehrt).toBe(true);
    expect(syncCalls.n).toBe(1);
  });

  it("synchronisiert bei veraltetem Stand", async () => {
    await prisma.organization.update({ where: { id: world.org.id }, data: { lastSyncAt: new Date(Date.now() - 3_600_000) } });
    const r = await call("sync_ausloesen", { bestaetigt: true });
    expect(r.result.ausgefuehrt).toBe(true);
    expect(syncCalls.n).toBe(1);
  });
});

describe("ortstaxe mit Kindern", () => {
  it("zieht Kinder je Buchung ab und weist darauf hin", async () => {
    const r = await call("ortstaxe", {
      von_monat: "2026-11", bis_monat: "2026-11",
      kinder: [{ buchung_id: world.bookings.b5.id, anzahl: 3 }, { buchung_id: "gibt-es-nicht", anzahl: 1 }],
    });
    // Nov ohne Abzug 28 Personen-Nächte; Eva: 3 Nächte × (5 − 3) statt × 5 → 28 − 9 = 19
    expect(r.result.monate[0]).toMatchObject({ personen_naechte: 19, betrag: money(57) });
    expect(r.result.kinder_abgezogen_bei_buchungen).toBe(1);
    expect(r.result.unbekannte_buchung_ids).toEqual(["gibt-es-nicht"]);
    expect(r.result.hinweis).toMatch(/Erwachsenem/);
    expect(r.result.hinweis).toMatch(/Kinder abgezogen/);
  });
});

describe("Was es NICHT gibt", () => {
  it("keine Lösch- oder Preis-Tools; Gästenachrichten nur über messages:* und mit Bestätigung", async () => {
    const { TOOLS } = await import("@/lib/mcp/registry");
    const names = TOOLS.map((t) => t.name).join(" ");
    expect(names).not.toMatch(/loesch|lösch|delete|preis|price|smoobu_/i);
    // Entscheidung Mathias 30.10.2026: Gästechat lesen/antworten, Senden nur nach Bestätigung
    for (const t of TOOLS.filter((t) => /nachricht|antworten/.test(t.name))) expect(t.scope).toMatch(/^messages:/);
    expect(TOOLS.find((t) => t.name === "gast_antworten")).toMatchObject({ write: true, scope: "messages:write" });
    for (const t of TOOLS.filter((t) => t.write)) expect(t.input).toHaveProperty("bestaetigt");
  });
});
