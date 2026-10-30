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
- Wäsche wird auf der Website der Wäscherei bestellt; waesche_status hält nur den Stand in der App fest.`;

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
