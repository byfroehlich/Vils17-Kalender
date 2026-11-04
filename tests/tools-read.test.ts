import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { SCOPES } from "@/lib/mcp/tokens";
import { nextBookingPayout } from "@/lib/mcp/tools/finance";
import { money, viennaIso } from "@/lib/mcp/format";
import { resetDb, seedWorld } from "./fixtures";

// Testwelt (siehe fixtures.ts):
//  Lodge     b1 Anna   03.–06.10.  2 P  Airbnb   450 €  erledigt Kerstin (bezahlt)
//            b2 Bernd  30.10.–02.11. 4 P Booking  600 €  zugewiesen Kerstin, 1 Hund
//            b3 Clara  05.–08.11.  3 P  direkt   390 €  offen
//  Penthouse b4 Dieter 10.–12.10.  2 P  Airbnb   300 €  erledigt Vanessa (offen)
//            b5 Eva    01.–04.11.  5 P  Booking  750 €  abgesagt von Vanessa, 70-€-Buchung
//            b6 Frank  10.–12.11.  storniert

let world: Awaited<ReturnType<typeof seedWorld>>;
let ctx: ToolContext;

async function call(name: string, args: Record<string, unknown> = {}, c: ToolContext = ctx) {
  const tool = findTool(name);
  if (!tool) throw new Error(`Tool ${name} fehlt`);
  return runTool(tool, args, c) as Promise<{ ok: boolean; result: any }>;
}

beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  ctx = { organizationId: world.org.id, tokenId: "t1", tokenName: "Test", scopes: [...SCOPES] };
});

describe("Format", () => {
  it("Geld als Zahl und deutscher Text", () => {
    expect(money(1234.5)).toEqual({ betrag: 1234.5, text: "1.234,50 €" });
    expect(money(0.125).betrag).toBe(0.13);
  });
  it("Zeitpunkte mit Wiener Offset (Sommer- und Winterzeit)", () => {
    expect(viennaIso(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01T12:00:00+02:00");
    expect(viennaIso(new Date("2026-10-29T07:00:00Z"))).toBe("2026-10-29T08:00:00+01:00");
  });
  it("Booking.com-Zahltag: 14-tägig freitags nach Abreise", () => {
    const anchor = new Date("2026-01-02T00:00:00Z");
    expect(nextBookingPayout(new Date("2026-11-02T00:00:00Z"), anchor).toISOString().slice(0, 10)).toBe("2026-11-06");
    // Abreise am Zahltag selbst → nächster Termin
    expect(nextBookingPayout(new Date("2026-11-06T00:00:00Z"), anchor).toISOString().slice(0, 10)).toBe("2026-11-20");
  });
});

describe("Scopes", () => {
  it("verweigert Tools ohne passenden Scope", async () => {
    const r = await call("umsatz", { jahr: 2026 }, { ...ctx, scopes: ["bookings:read"] });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/finance:read/);
  });
  it("lehnt unbekannte Parameter ab", async () => {
    const r = await call("wohnungen_list", { quatsch: 1 });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/Ungültige Parameter/);
  });
});

describe("wohnungen_list", () => {
  it("zeigt Reinigungskraft und vereinbarten Betrag", async () => {
    const r = await call("wohnungen_list");
    const ph = r.result.wohnungen.find((w: any) => w.name.startsWith("Penthouse"));
    expect(ph.reinigungskraft).toBe("Vanessa");
    expect(ph.reinigungssatz.vereinbart).toMatchObject({ betrag: 70, text: "70,00 €", fuer: "Vanessa", gilt_fuer_buchungen_ab: "2026-10-01" });
    expect(ph.smoobu_id).toBe(102);
  });
});

describe("buchungen_list", () => {
  const range = { von: "2026-10-01", bis: "2026-11-30" };
  it("liefert bestätigte Buchungen mit allen Feldern", async () => {
    const r = await call("buchungen_list", range);
    expect(r.result.gesamt).toBe(5);
    const bernd = r.result.eintraege.find((b: any) => b.gast === "Bernd Huber");
    expect(bernd).toMatchObject({
      personen: 4, haustiere: 1, check_in: "2026-10-30", check_out: "2026-11-02", naechte: 3,
      anreise_ab: "15:00", abreise_bis: "10:00", kanal: "Booking.com", status: "bestaetigt",
      preis: { betrag: 600, text: "600,00 €" },
    });
  });
  it("filtert nach Kanal, Wohnung und Status", async () => {
    expect((await call("buchungen_list", { ...range, kanal: "Booking.com" })).result.gesamt).toBe(2);
    expect((await call("buchungen_list", { ...range, wohnung: "pent" })).result.gesamt).toBe(2);
    expect((await call("buchungen_list", { ...range, status: "alle" })).result.gesamt).toBe(6);
    expect((await call("buchungen_list", { ...range, kanal: "Direkt" })).result.eintraege[0].gast).toBe("Clara Wolf");
  });
  it("blättert mit limit und cursor", async () => {
    const p1 = await call("buchungen_list", { ...range, limit: 2 });
    expect(p1.result.eintraege).toHaveLength(2);
    expect(p1.result.naechster_cursor).toBeTruthy();
    const p3 = await call("buchungen_list", { ...range, limit: 2, cursor: (await call("buchungen_list", { ...range, limit: 2, cursor: p1.result.naechster_cursor })).result.naechster_cursor });
    expect(p3.result.eintraege).toHaveLength(1);
    expect(p3.result.naechster_cursor).toBeNull();
  });
  it("meldet unbekannte Wohnung verständlich", async () => {
    const r = await call("buchungen_list", { wohnung: "Chalet" });
    expect(r.ok).toBe(false);
    expect(r.result.error).toMatch(/Keine Wohnung passt/);
  });
});

describe("anreisen_abreisen", () => {
  it("zeigt Anreisen mit Reinigungsstatus und Abreisen pro Tag", async () => {
    const r = await call("anreisen_abreisen", { datum: "2026-11-01", tage: 2 });
    const [d1, d2] = r.result.tage;
    expect(d1.datum).toBe("2026-11-01");
    expect(d1.anreisen).toHaveLength(1);
    expect(d1.anreisen[0]).toMatchObject({ gast: "Eva Klein", personen: 5, reinigung: { zugewiesen: false, abgesagt: true } });
    expect(d2.abreisen.map((a: any) => a.gast)).toEqual(["Bernd Huber"]);
    expect(r.result.reinigungen_ohne_zuweisung).toBe(1);
  });
});

describe("belegung", () => {
  it("rechnet Auslastung je Monat ohne Stornos", async () => {
    const r = await call("belegung", { von_monat: "2026-10", bis_monat: "2026-11", luecken_ab: "2026-10-25", luecken_tage: 20 });
    const lodge = r.result.wohnungen.find((w: any) => w.name.startsWith("Lodge"));
    const ph = r.result.wohnungen.find((w: any) => w.name.startsWith("Penthouse"));
    expect(lodge.auslastung).toEqual([
      { monat: "2026-10", belegte_naechte: 5, naechte_im_monat: 31, auslastung_prozent: 16.1 },
      { monat: "2026-11", belegte_naechte: 4, naechte_im_monat: 30, auslastung_prozent: 13.3 },
    ]);
    expect(ph.auslastung[1]).toMatchObject({ belegte_naechte: 3, auslastung_prozent: 10 });
    expect(lodge.freie_luecken.luecken).toEqual([
      { von: "2026-10-25", bis: "2026-10-30", naechte: 5 },
      { von: "2026-11-02", bis: "2026-11-05", naechte: 3 },
      { von: "2026-11-08", bis: "2026-11-14", naechte: 6 },
    ]);
  });
});

describe("umsatz", () => {
  it("verteilt den Umsatz anteilig auf die Nächte", async () => {
    const r = await call("umsatz", { jahr: 2026 });
    expect(r.result.gesamt.summe).toEqual(money(2490));
    expect(r.result.gesamt.naechte).toBe(14);
    const okt = r.result.monate.find((m: any) => m.monat === "2026-10");
    const nov = r.result.monate.find((m: any) => m.monat === "2026-11");
    expect(okt.kanaele.Airbnb).toMatchObject({ summe: money(750), naechte: 5, buchungen: 2, preis_pro_nacht: money(150) });
    expect(okt.kanaele["Booking.com"]).toMatchObject({ summe: money(400), naechte: 2 });
    expect(nov.kanaele["Booking.com"]).toMatchObject({ summe: money(950), naechte: 4, buchungen: 2 });
    expect(nov.kanaele.Direkt.summe).toEqual(money(390));
    expect(nov.kanaele.Airbnb.summe.betrag).toBe(0); // storniert
  });
  it("ordnet wahlweise ganz dem Anreisemonat zu", async () => {
    const r = await call("umsatz", { jahr: 2026, zuordnung: "anreise" });
    const okt = r.result.monate.find((m: any) => m.monat === "2026-10");
    expect(okt.kanaele["Booking.com"].summe).toEqual(money(600));
  });
  it("schätzt Auszahlungen je Zahltag", async () => {
    const r = await call("umsatz", { jahr: 2026 });
    const p = r.result.erwartete_auszahlungen;
    expect(p.schaetzung).toBe(true);
    expect(p.auszahlungen).toEqual([
      { datum: "2026-10-04", kanal: "Airbnb", betrag: money(450), buchungen: 1 },
      { datum: "2026-10-11", kanal: "Airbnb", betrag: money(300), buchungen: 1 },
      { datum: "2026-11-06", kanal: "Booking.com", betrag: money(1350), buchungen: 2 },
      { datum: null, kanal: "Direkt", betrag: money(390), buchungen: 1 },
    ]);
  });
});

describe("ortstaxe", () => {
  it("Nächte × Personen × 3,00 € je Monat", async () => {
    const r = await call("ortstaxe", { von_monat: "2026-10", bis_monat: "2026-11" });
    expect(r.result.monate).toEqual([
      { monat: "2026-10", buchungen: 3, naechte: 7, personen_naechte: 18, betrag: money(54) },
      { monat: "2026-11", buchungen: 3, naechte: 7, personen_naechte: 28, betrag: money(84) },
    ]);
    expect(r.result.gesamt.betrag).toEqual(money(138));
    expect(r.result.hinweis).toMatch(/Kinder/);
  });
  it("zählt ohne Kinder nur Erwachsene aus der Portal-Mail", async () => {
    await prisma.emailImport.create({
      data: { organizationId: world.org.id, messageId: "m1", status: "APPLIED", bookingId: world.bookings.b5.id, parsedAdults: 2, parsedChildren: 3 },
    });
    const r = await call("ortstaxe", { von_monat: "2026-11", bis_monat: "2026-11", kinder_zaehlen: false });
    expect(r.result.monate[0]).toMatchObject({ personen_naechte: 19, betrag: money(57), buchungen_ohne_aufteilung: 2 });
  });
});

describe("reinigungen", () => {
  const range = { von: "2026-10-01", bis: "2026-11-30" };
  it("zeigt Status, Reinigungskraft und Wäsche nach Konfiguration", async () => {
    const r = await call("reinigungen", range);
    expect(r.result.gesamt).toBe(5);
    const bernd = r.result.eintraege.find((e: any) => e.reinigungstag === "2026-10-30");
    expect(bernd).toMatchObject({
      status: "ASSIGNED", reinigungskraft: "Kerstin", naechste_gaeste: 4, haustiere: 1,
      waesche: { bettsets: 2, handtuecher: 8, kuechentuecher: 1 },
    });
    // Kein Wäschestatus pro Buchung mehr (Wäsche nach Bestand, 31.10.2026)
    expect(bernd.waesche.status).toBeUndefined();
  });
  it("filtert Absagen mit Grund", async () => {
    const r = await call("reinigungen", { ...range, nur_absagen: true });
    expect(r.result.eintraege).toHaveLength(1);
    expect(r.result.eintraege[0].absage).toMatchObject({ von: "Vanessa", grund: "krank" });
  });
  it("filtert nach Reinigungskraft und Status", async () => {
    expect((await call("reinigungen", { ...range, reinigungskraft: "kerst" })).result.gesamt).toBe(2);
    expect((await call("reinigungen", { ...range, status: "UNASSIGNED" })).result.gesamt).toBe(2);
  });
});

describe("auszahlungen_reinigung", () => {
  it("summiert je Reinigungskraft und Monat, offen vs. ausgezahlt", async () => {
    const r = await call("auszahlungen_reinigung", { jahr: 2026 });
    expect(r.result.gesamt_offen).toEqual(money(50));
    const kerstin = r.result.eintraege.find((e: any) => e.reinigungskraft === "Kerstin");
    expect(kerstin).toMatchObject({ monat: "2026-10", reinigungen: 1, ausgezahlt: money(50), offen: money(0), status: "ausgezahlt" });
    const only = await call("auszahlungen_reinigung", { jahr: 2026, nur_offen: true });
    expect(only.result.eintraege.map((e: any) => e.reinigungskraft)).toEqual(["Vanessa"]);
  });
  it("nutzt den vereinbarten Betrag, wenn Vanessa die 70-€-Buchung erledigt", async () => {
    await prisma.cleaningAssignment.update({
      where: { bookingId: world.bookings.b5.id },
      data: { status: "COMPLETED", cleanerUnavailable: false, rate: null },
    });
    const r = await call("auszahlungen_reinigung", { von_monat: "2026-11", bis_monat: "2026-11" });
    expect(r.result.eintraege[0]).toMatchObject({ reinigungskraft: "Vanessa", gesamt: money(70), davon_mit_vereinbartem_betrag: 1 });
  });
});

describe("sync_status", () => {
  it("meldet letzten Sync mit Wiener Zeit", async () => {
    const r = await call("sync_status");
    expect(r.result.smoobu.letzter_sync).toBe("2026-10-29T08:00:00+01:00");
    expect(r.result.email_import).toHaveProperty("probleme");
  });
});

describe("Audit", () => {
  it("protokolliert jeden Aufruf ohne Freitexte", async () => {
    await call("buchungen_list", { von: "2026-10-01", wohnung: "Penthouse No. 17" });
    await call("umsatz", {}, { ...ctx, scopes: ["bookings:read"] });
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["mcp.buchungen_list", "mcp.umsatz"]);
    const d0 = logs[0].details as any;
    expect(d0).toMatchObject({ token: "Test", status: "ok", parameter: { von: "2026-10-01", wohnung: "[Text]" } });
    expect(typeof d0.dauer_ms).toBe("number");
    expect((logs[1].details as any).status).toBe("verweigert");
  });
});
