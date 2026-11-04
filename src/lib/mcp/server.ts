import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOLS } from "./registry";
import { runTool, type ToolContext } from "./tool";

export const SERVER_INFO = { name: "vils17-kalender", version: "1.0.0" };

const INSTRUCTIONS = `Schnittstelle der Vils17-Kalender-App (Ferienwohnungen Lodge No. 17 und Penthouse No. 17 in Vils/Tirol).
Daten kommen aus Smoobu (Buchungen) und der App selbst (Reinigung, Wäsche, Abrechnung).
- Bei Zahlen zuerst sync_status prüfen, wenn sie veraltet wirken.
- Datumsangaben JJJJ-MM-TT, Zeitpunkte in Europe/Vienna. Geld als Zahl in Euro und als Text.
- Der Reinigungstag ist der Anreisetag der nächsten Gäste.
- Schreib-Tools ändern nur mit "bestaetigt": true. Erst ohne aufrufen, Mathias die Vorschau zeigen, nach seiner Zustimmung mit true ausführen.
- Auszahlungsdaten der Portale sind Schätzungen.
- Gästenachrichten: gast_antworten sendet erst mit "bestaetigt": true — Mathias muss den genauen Text vorher freigeben.
- Postfach info@vils17.at (Portale, Gäste, Behörden, Haus): postfach listet/sucht, mail_lesen liest (markiert nichts als gelesen), mail_senden sendet erst mit "bestaetigt": true nach Freigabe von Empfänger, Betreff und Text.
- Wäsche läuft nach Bestand im Keller, nicht pro Buchung (ein offener Wäschestatus einer Buchung ist kein Problem; waesche_status ist veraltet). Bestellt wird auf der Website der Wäscherei. Bestellmenge: waesche_bedarf (Vorgabe 14 Tage); Bestellung festhalten: waesche_lieferung_erfassen; „Lieferung ist im Keller“: waesche_lieferung_angekommen. Spannbettlaken je Bettgröße 90/180/200 nach waesche_betten.
- Hunde: 15 € pro Hund und Nacht. Airbnb kassiert selbst; bei Booking.com/Direkt per hundegebuehr_anfordern (Text vorher freigeben). hunde_pruefen durchsucht die Chats.
- Hinweis für die Reinigung (Kinderbett, Hochstuhl, Zustellbett, getrennt schlafen …): die App erkennt Sonderwünsche in den Gästechats; hinweis_vorschlaege listet sie, hinweis_uebernehmen übernimmt (Text änderbar, Zusatzbetten 0–3) oder verwirft.
- Stammgäste: stammgaeste listet die Gäste, die sich selbst über die Gästemappe eingetragen haben. Angebote nur über Kanäle mit Einwilligung (E-Mail/WhatsApp), nie an abgemeldete; jede Werbe-Mail enthält den Abmelde-Link.`;

/**
 * Baut pro Anfrage einen zustandslosen MCP-Server. Angemeldet werden nur die
 * Tools, deren Scope das Token hat — tools/list zeigt also genau, was erlaubt ist.
 */
export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  for (const def of TOOLS) {
    if (!ctx.scopes.includes(def.scope)) continue;
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: {
          title: def.title,
          readOnlyHint: !def.write,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        const { ok, result } = await runTool(def, args ?? {}, ctx);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as Record<string, unknown>,
          isError: !ok,
        };
      }
    );
  }

  return server;
}
