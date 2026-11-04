import { z } from "zod";
import type { Scope } from "./tokens";
import { prisma } from "../prisma";

// ─── Grundgerüst der MCP-Tools ────────────────────────────────────────────────
// Ein Tool = Name, deutsche Beschreibung (WANN man es benutzt), Scope,
// Eingabe-Schema (zod) und Handler. Der Handler kennt kein HTTP und kein MCP —
// er bekommt geprüfte Argumente und den Kontext und liefert ein Objekt zurück.

export interface ToolContext {
  organizationId: string;
  tokenId: string;
  tokenName: string;
  scopes: Scope[];
}

/** Fachlicher Fehler, der als {"error": "..."} beim Aufrufer ankommt. */
export class ToolError extends Error {}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  /** Schreib-Tool: ohne `bestaetigt: true` nur Vorschau */
  write?: boolean;
  input: S;
  handler: (args: z.objectOutputType<S, z.ZodTypeAny>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

/** Ergebnis eines Schreib-Tools ohne Bestätigung */
export function preview(wuerdePassieren: string, details: Record<string, unknown> = {}) {
  return {
    vorschau: true,
    ausgefuehrt: false,
    wuerde_passieren: wuerdePassieren,
    ...details,
    hinweis: "Es wurde nichts geändert. Zum Ausführen dasselbe Tool mit \"bestaetigt\": true aufrufen.",
  };
}

export const bestaetigtSchema = z
  .boolean()
  .optional()
  .describe("Erst auf true setzen, nachdem Mathias die Vorschau bestätigt hat. Ohne: nur Vorschau, keine Änderung.");

// ─── Audit ────────────────────────────────────────────────────────────────────

/**
 * Parameter fürs Audit-Log ohne personenbezogene Freitexte: Zahlen, Booleans,
 * IDs, Datumsangaben und Aufzählungswerte bleiben; alles andere (Namen,
 * Notizen) wird durch "[Text]" ersetzt.
 */
export function sanitizeForAudit(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (v === null || v === undefined || typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = /^[\w.:+-]{1,64}$/.test(v) ? v : "[Text]"; // keine Mailadressen
    else out[k] = "[Wert]";
  }
  return out;
}

export async function auditCall(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  status: "ok" | "vorschau" | "fehler" | "verweigert",
  durationMs: number,
  fehler?: string
) {
  await prisma.auditLog
    .create({
      data: {
        organizationId: ctx.organizationId,
        action: `mcp.${tool}`,
        // Ziel des Aufrufs: die betroffene Buchung, sonst das Token selbst
        entityType: typeof args?.buchung_id === "string" ? "Booking" : "McpToken",
        entityId: typeof args?.buchung_id === "string" ? args.buchung_id : ctx.tokenId,
        details: {
          token: ctx.tokenName,
          token_id: ctx.tokenId,
          tool,
          parameter: sanitizeForAudit(args),
          status,
          dauer_ms: durationMs,
          ...(fehler ? { fehler: fehler.slice(0, 300) } : {}),
        } as object,
      },
    })
    .catch((err) => console.error("[mcp] Audit fehlgeschlagen:", err));
}

/**
 * Führt ein Tool aus: Scope prüfen, Handler laufen lassen, Audit schreiben.
 * Liefert immer ein Objekt — bei Fehlern {"error": "..."}.
 */
export async function runTool(
  def: ToolDef,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ ok: boolean; result: unknown }> {
  const started = Date.now();

  if (!ctx.scopes.includes(def.scope)) {
    const error = `Token hat keinen Zugriff auf ${def.name} (benötigt Scope ${def.scope})`;
    await auditCall(ctx, def.name, rawArgs, "verweigert", Date.now() - started, error);
    return { ok: false, result: { error } };
  }

  const parsed = z.object(def.input).strict().safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const error = "Ungültige Parameter: " + parsed.error.issues.map((i) => `${i.path.join(".") || "(Eingabe)"}: ${i.message}`).join("; ");
    await auditCall(ctx, def.name, rawArgs, "fehler", Date.now() - started, error);
    return { ok: false, result: { error } };
  }

  try {
    const result = await def.handler(parsed.data, ctx);
    const isPreview = !!(result && typeof result === "object" && (result as { vorschau?: boolean }).vorschau);
    await auditCall(ctx, def.name, rawArgs, isPreview ? "vorschau" : "ok", Date.now() - started);
    return { ok: true, result };
  } catch (err) {
    const error = err instanceof ToolError ? err.message : "Interner Fehler bei der Ausführung";
    if (!(err instanceof ToolError)) console.error(`[mcp] ${def.name}:`, err);
    await auditCall(ctx, def.name, rawArgs, "fehler", Date.now() - started, err instanceof Error ? err.message : String(err));
    return { ok: false, result: { error } };
  }
}
