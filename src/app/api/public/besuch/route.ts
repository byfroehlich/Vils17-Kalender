import { NextRequest, NextResponse } from "next/server";
import { resolvePublicOrganizationId } from "@/lib/regular-guests";
import {
  ALLOWED_ORIGINS,
  MAX_BODY_BYTES,
  allowBeacon,
  beaconSchema,
  isBot,
  optedOut,
  recordBeacon,
} from "@/lib/website-analytics";

// ─── Öffentliche Besuchermessung für vils17.at ────────────────────────────────
// Empfängt Meldungen von website/assets/m.js (navigator.sendBeacon, text/plain —
// damit ohne CORS-Vorabanfrage). Ohne Anmeldung erreichbar (Middleware deckt /api
// nicht ab). Nur von vils17.at. IP und User-Agent werden nur zur Berechnung der
// Tages-Kennung benutzt und nie gespeichert oder protokolliert.

export const dynamic = "force-dynamic";

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  return origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : null;
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = allowedOrigin(req);
  const base = { Vary: "Origin", "Cache-Control": "no-store" };
  if (!origin) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unbekannt";
}

const empty = (status: number, headers: Record<string, string>) => new NextResponse(null, { status, headers });

export async function OPTIONS(req: NextRequest) {
  return empty(204, corsHeaders(req));
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  if (!allowedOrigin(req)) return empty(403, headers);

  // Do-Not-Track / Global Privacy Control und Bots: annehmen, aber nichts erfassen
  const ua = req.headers.get("user-agent") ?? "";
  if (optedOut(req.headers) || isBot(ua)) return empty(204, headers);

  const ip = clientIp(req);
  if (!allowBeacon(ip)) return empty(429, { ...headers, "Retry-After": "600" });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return empty(413, headers);
  const text = await req.text().catch(() => "");
  if (!text || Buffer.byteLength(text) > MAX_BODY_BYTES) return empty(text ? 413 : 400, headers);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return empty(400, headers);
  }
  const parsed = beaconSchema.safeParse(json);
  if (!parsed.success) return empty(400, headers);

  const organizationId = await resolvePublicOrganizationId();
  if (!organizationId) return empty(503, headers);

  try {
    await recordBeacon(parsed.data, { organizationId, ip, ua, headers: req.headers });
  } catch (err) {
    // Nur der Fehlertyp — keine Anfragedaten
    console.error("[besuch] Speichern fehlgeschlagen:", err instanceof Error ? err.name : "Fehler");
    return empty(500, headers);
  }
  return empty(204, headers);
}
