import { NextResponse } from "next/server";
import { checkRateLimit } from "../mcp/rate-limit";
import { OAuthError } from "./config";

// Antworten der OAuth-Endpunkte. CORS nur hier (Metadaten, Registrierung,
// Token) — ohne Cookies, damit Browser-Clients wie der MCP Inspector
// funktionieren. /api/mcp bleibt ohne CORS.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...NO_STORE, ...extra } });
}

export function oauthErrorResponse(err: unknown) {
  if (err instanceof OAuthError) {
    return oauthJson({ error: err.error, error_description: err.description }, err.status);
  }
  console.error("[OAuth]", err);
  return oauthJson({ error: "server_error", error_description: "Interner Fehler" }, 500);
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

/** Formular (application/x-www-form-urlencoded) oder — nachsichtig — JSON. */
export async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") p.set(k, v);
    return p;
  }
  return new URLSearchParams(await req.text());
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unbekannt";
}

/** Begrenzung pro IP für Registrierung und Token-Endpunkt. */
export function limitByIp(req: Request, bucket: string, max: number) {
  const wait = checkRateLimit(`oauth:${bucket}:${clientIp(req)}`, Date.now(), max);
  if (wait === null) return null;
  return oauthJson(
    { error: "rate_limited", error_description: `Zu viele Anfragen — bitte in ${wait} s erneut versuchen` },
    429,
    { "Retry-After": String(wait) }
  );
}
