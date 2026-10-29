// Prüft die MCP-Schnittstelle einer laufenden App mit dem offiziellen MCP-Client.
//
//   MCP_TOKEN=v17_… npx tsx scripts/mcp-pruefen.ts [URL]
//
// URL: Vorgabe http://localhost:3000/api/mcp (oder MCP_URL).
// Prüft: Anmeldung, tools/list, Schema jedes Tools, Schreib-Tools mit
// "bestaetigt", und ruft sync_status + anreisen_abreisen (nächste 7 Tage) auf,
// wenn das Token sie sehen darf. Ändert nichts (keine Schreib-Tools mit true).

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? process.env.MCP_URL ?? "http://localhost:3000/api/mcp";
const token = process.env.MCP_TOKEN;

const ERWARTET = {
  "bookings:read": ["wohnungen_list", "buchungen_list", "anreisen_abreisen", "belegung", "sync_status"],
  "cleaning:read": ["reinigungen"],
  "finance:read": ["umsatz", "ortstaxe", "auszahlungen_reinigung"],
  "cleaning:write": ["reinigung_zuweisen", "buchung_notiz", "gaestezahl_korrigieren", "sync_ausloesen"],
};
const SCHREIBEND = new Set(ERWARTET["cleaning:write"]);
const BEKANNT = new Set(Object.values(ERWARTET).flat());

let fehler = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string) => { fehler++; console.log(`  ✗ ${msg}`); };

async function main() {
  if (!token) {
    console.error("MCP_TOKEN fehlt (Token aus Einstellungen → Claude-Schnittstelle).");
    process.exit(2);
  }
  console.log(`Prüfe ${url}\n`);

  // 1. Ohne Token muss abgelehnt werden
  const anon = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  anon.status === 401 ? ok("ohne Token: 401") : bad(`ohne Token: erwartet 401, bekommen ${anon.status}`);

  // 2. Mit Token verbinden (initialize)
  const client = new Client({ name: "mcp-pruefen", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })
  );
  const info = client.getServerVersion();
  info?.name === "vils17-kalender" ? ok(`initialize: ${info.name} ${info.version}`) : bad(`initialize: unerwarteter Server ${JSON.stringify(info)}`);

  // 3. tools/list
  const { tools } = await client.listTools();
  ok(`tools/list: ${tools.length} Tools — ${tools.map((t) => t.name).join(", ")}`);
  for (const t of tools) {
    if (!BEKANNT.has(t.name)) bad(`${t.name}: unbekanntes Tool`);
    if (!t.description || t.description.length < 40) bad(`${t.name}: Beschreibung fehlt oder zu kurz`);
    if (t.inputSchema?.type !== "object") bad(`${t.name}: inputSchema ist kein Objekt`);
    if (SCHREIBEND.has(t.name)) {
      if (!t.inputSchema.properties || !("bestaetigt" in t.inputSchema.properties)) bad(`${t.name}: Parameter "bestaetigt" fehlt`);
      if (t.annotations?.readOnlyHint !== false) bad(`${t.name}: nicht als schreibend markiert`);
    } else if (t.annotations?.readOnlyHint !== true) {
      bad(`${t.name}: nicht als lesend markiert`);
    }
  }
  if (!fehler) ok("alle Schemas gültig");
  const verboten = tools.filter((t) => /loesch|lösch|delete|preis|price|nachricht|message/i.test(t.name));
  verboten.length ? bad(`verbotene Tools: ${verboten.map((t) => t.name).join(", ")}`) : ok("keine Lösch-/Preis-/Nachrichten-Tools");

  // 4. Probeaufrufe (nur lesend)
  const names = new Set(tools.map((t) => t.name));
  for (const [name, args] of [["sync_status", {}], ["anreisen_abreisen", { tage: 7 }]] as const) {
    if (!names.has(name)) continue;
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0]?.text ?? "";
    if (r.isError) bad(`${name}: ${text}`);
    else ok(`${name}: ${text.slice(0, 160)}${text.length > 160 ? " …" : ""}`);
  }

  await client.close();
  console.log(fehler ? `\n${fehler} Problem(e).` : "\nAlles in Ordnung.");
  process.exit(fehler ? 1 : 0);
}

main().catch((err) => {
  console.error("Abbruch:", err instanceof Error ? err.message : err);
  process.exit(1);
});
