import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runTool, sanitizeForAudit, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { phoneKey, nameMatches } from "@/lib/mcp/tools/gast";
import { resetDb, seedWorld } from "./fixtures";

// Feriengast-Assistent (Entscheidung Mathias 09.11.2026): Token nur mit gast:read,
// frei/belegt ohne Namen, eigene Buchung nur über Telefon oder Name + Anreise + Nummer/E-Mail.

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;

async function call(name: string, args: Record<string, unknown> = {}, c: ToolContext = ctx) {
  const tool = findTool(name);
  if (!tool) throw new Error(`Tool ${name} fehlt`);
  return runTool(tool, args, c) as Promise<{ ok: boolean; result: any }>;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  await resetDb();
  world = await seedWorld();
  ctx = { organizationId: world.org.id, tokenId: "t-gast", tokenName: "Theo Feriengast", scopes: ["gast:read"] };
  await prisma.booking.update({ where: { id: world.bookings.b3.id }, data: { guestPhone: "+43 664 123 45 67", guestEmail: "Clara@Example.org", smoobuId: 777001 } });
  await prisma.booking.update({ where: { id: world.bookings.b1.id }, data: { guestPhone: "0664 1234567" } }); // gleiche Nummer, aber > 14 Tage nach Abreise
});
afterEach(() => vi.useRealTimers());

describe("Hilfsfunktionen", () => {
  it("Telefonnummern unabhängig vom Format vergleichbar", () => {
    expect(phoneKey("+43 664 123 45 67")).toBe(phoneKey("0043664/1234567"));
    expect(phoneKey("0664 1234567")).toBe(phoneKey("436641234567"));
    expect(phoneKey("123")).toBeNull();
  });
  it("Nachname muss passen, Umlaute egal", () => {
    expect(nameMatches("clara wolf", "Clara Wolf")).toBe(true);
    expect(nameMatches("Müller", "Hans Mueller")).toBe(true);
    expect(nameMatches("Clara", "Clara Wolf")).toBe(false);
  });
});

describe("Scope gast:read", () => {
  it("darf keine normalen Buchungsdaten lesen", async () => {
    const r = await call("buchungen_list", {});
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/bookings:read/);
  });
});

describe("gast_verfuegbarkeit", () => {
  it("liefert belegt/frei ohne Namen und Preise", async () => {
    const r = await call("gast_verfuegbarkeit", { von: "2026-11-01", bis: "2026-11-15" });
    expect(r.ok).toBe(true);
    const lodge = r.result.wohnungen.find((w: any) => w.wohnung.startsWith("Lodge"));
    expect(lodge.belegt).toEqual([{ von: "2026-10-30", bis: "2026-11-02" }, { von: "2026-11-05", bis: "2026-11-08" }]);
    expect(lodge.frei[0]).toEqual({ von: "2026-11-02", bis: "2026-11-05", naechte: 3 });
    const text = JSON.stringify(r.result);
    expect(text).not.toMatch(/Bernd|Clara|Eva|Frank|450|600/);
  });
  it("stornierte Buchungen gelten als frei", async () => {
    const r = await call("gast_verfuegbarkeit", { von: "2026-11-09", bis: "2026-11-13" });
    const pent = r.result.wohnungen.find((w: any) => w.wohnung.startsWith("Penthouse"));
    expect(pent.belegt).toEqual([]);
  });
  it("begrenzt den Zeitraum", async () => {
    const r = await call("gast_verfuegbarkeit", { von: "2026-11-01", bis: "2028-01-01" });
    expect(r.ok).toBe(false);
  });
});

describe("gast_buchung", () => {
  it("findet die eigene Buchung über die Telefonnummer", async () => {
    const r = await call("gast_buchung", { telefon: "4366412345 67" });
    expect(r.ok).toBe(true);
    expect(r.result.treffer).toBe(1);
    const b = r.result.buchungen[0];
    expect(b).toMatchObject({ vorname: "Clara", check_in: "2026-11-05", check_out: "2026-11-08", personen: 3, buchungsnummer: 777001 });
    expect(JSON.stringify(r.result)).not.toMatch(/Wolf|390|Example|664/);
  });
  it("Name + Anreise allein reichen nicht", async () => {
    const r = await call("gast_buchung", { name: "Clara Wolf", anreise: "2026-11-05" });
    expect(r.ok).toBe(false);
  });
  it("Name + Anreise + Buchungsnummer oder E-Mail", async () => {
    expect((await call("gast_buchung", { name: "Wolf", anreise: "2026-11-05", buchungsnummer: "777001" })).result.treffer).toBe(1);
    expect((await call("gast_buchung", { name: "Wolf", anreise: "2026-11-05", email: "clara@example.org " })).result.treffer).toBe(1);
    expect((await call("gast_buchung", { name: "Wolf", anreise: "2026-11-05", buchungsnummer: "777002" })).result.treffer).toBe(0);
    expect((await call("gast_buchung", { name: "Berger", anreise: "2026-11-05", buchungsnummer: "777001" })).result.treffer).toBe(0);
  });
  it("keine Zuordnung mehr 14 Tage nach Abreise", async () => {
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    expect((await call("gast_buchung", { telefon: "+436641234567" })).result.treffer).toBe(0);
  });
  it("Telefon, Name, E-Mail landen nicht im Audit-Log", () => {
    expect(sanitizeForAudit({ telefon: "+436641234567", name: "Wolf", email: "a@b.c", anreise: "2026-11-05" }))
      .toEqual({ telefon: "[Text]", name: "[Text]", email: "[Text]", anreise: "2026-11-05" });
  });
});
