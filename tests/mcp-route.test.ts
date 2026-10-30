import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/mcp/route";
import { resetRateLimit } from "@/lib/mcp/rate-limit";
import { resetDb, seedWorld, createToken } from "./fixtures";

let token: string;
let readOnlyToken: string;
let id = 0;

function rpc(method: string, params: Record<string, unknown> = {}, auth: string | null = token) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
}

async function call(method: string, params: Record<string, unknown> = {}, auth: string | null = token) {
  const res = await POST(rpc(method, params, auth));
  return { status: res.status, headers: res.headers, body: await res.json() };
}

beforeEach(async () => {
  resetRateLimit();
  await resetDb();
  const w = await seedWorld();
  token = await createToken(w.org.id, ["bookings:read", "cleaning:read", "finance:read"], "Claude Desktop");
  readOnlyToken = await createToken(w.org.id, ["bookings:read"], "Nur Buchungen");
});

describe("/api/mcp", () => {
  it("initialize → tools/list → tools/call", async () => {
    const init = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("vils17-kalender");
    expect(init.body.result.capabilities.tools).toBeDefined();
    expect(init.body.result.instructions).toMatch(/bestaetigt/);

    const list = await call("tools/list");
    const names = list.body.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "anreisen_abreisen", "auszahlungen_reinigung", "belegung", "buchungen_list", "hunde_uebersicht", "ortstaxe",
      "reinigungen", "sync_status", "umsatz", "waesche_bedarf", "wochenplan", "wohnungen_list",
    ]);
    // Jedes Tool hat Beschreibung und JSON-Schema
    for (const t of list.body.result.tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
    const umsatz = list.body.result.tools.find((t: any) => t.name === "umsatz");
    expect(Object.keys(umsatz.inputSchema.properties)).toContain("jahr");
    expect(umsatz.annotations.readOnlyHint).toBe(true);

    const res = await call("tools/call", { name: "umsatz", arguments: { jahr: 2026 } });
    expect(res.body.result.isError).toBe(false);
    const data = JSON.parse(res.body.result.content[0].text);
    expect(data.gesamt.summe).toEqual({ betrag: 2490, text: "2.490,00 €" });
    expect(res.body.result.structuredContent.gesamt.naechte).toBe(14);
  });

  it("zeigt nur Tools, die der Scope erlaubt", async () => {
    const list = await call("tools/list", {}, readOnlyToken);
    const names = list.body.result.tools.map((t: any) => t.name);
    expect(names).toContain("buchungen_list");
    expect(names).not.toContain("umsatz");
    expect(names).not.toContain("reinigungen");
    const res = await call("tools/call", { name: "umsatz", arguments: {} }, readOnlyToken);
    expect(JSON.stringify(res.body)).toMatch(/umsatz/i);
    expect(res.body.result?.isError ?? true).toBe(true);
  });

  it("Schreib-Tools erscheinen nur mit cleaning:write — und sind als schreibend markiert", async () => {
    const org = await (await import("@/lib/prisma")).prisma.organization.findFirstOrThrow();
    const writeToken = await createToken(org.id, ["cleaning:write"], "Schreiben");
    const list = await call("tools/list", {}, writeToken);
    const tools = list.body.result.tools;
    expect(tools.map((t: any) => t.name).sort()).toEqual(["buchung_notiz", "gaestezahl_korrigieren", "hunde_eintragen", "hundegebuehr_status", "reinigung_status", "reinigung_zuweisen", "sync_ausloesen", "waesche_bestand_erfassen", "waesche_betten", "waesche_lieferung_erfassen", "waesche_reserve", "waesche_status"]);
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(false);
      expect(Object.keys(t.inputSchema.properties)).toContain("bestaetigt");
    }
  });

  it("liefert Tool-Fehler als {error} mit isError", async () => {
    const res = await call("tools/call", { name: "buchungen_list", arguments: { wohnung: "Chalet" } });
    expect(res.body.result.isError).toBe(true);
    expect(JSON.parse(res.body.result.content[0].text).error).toMatch(/Keine Wohnung/);
  });

  it("antwortet auf ping", async () => {
    const res = await call("ping");
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({});
  });

  it("lehnt fehlendes, falsches und widerrufenes Token ab", async () => {
    const none = await call("tools/list", {}, null);
    expect(none.status).toBe(401);
    expect(none.body).toHaveProperty("error");
    expect(none.headers.get("www-authenticate")).toMatch(/Bearer/);
    expect((await call("tools/list", {}, "v17_" + "x".repeat(43))).status).toBe(401);
  });

  it("begrenzt auf 60 Aufrufe pro Minute", async () => {
    for (let i = 0; i < 60; i++) expect((await call("ping")).status).toBe(200);
    const limited = await call("ping");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(limited.body.error).toMatch(/60/);
  });

  it("GET ist nicht erlaubt und öffnet kein CORS", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
