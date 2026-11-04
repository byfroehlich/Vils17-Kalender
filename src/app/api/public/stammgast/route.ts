import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_ORIGINS,
  allowSignup,
  resolvePublicOrganizationId,
  signupRegularGuest,
  signupSchema,
} from "@/lib/regular-guests";

// ─── Öffentliche Stammgast-Eintragung (Formular auf vils17.at/stammgast/) ─────
// Ohne Anmeldung erreichbar (die Middleware deckt /api nicht ab). CORS nur für
// vils17.at. Keine personenbezogenen Daten in Logs.

export const dynamic = "force-dynamic";

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !(ALLOWED_ORIGINS as readonly string[]).includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unbekannt";
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const headers = { ...corsHeaders(req), "Cache-Control": "no-store" };

  if (!allowSignup(clientIp(req))) {
    return NextResponse.json(
      { ok: false, error: "Zu viele Versuche. Bitte in ein paar Minuten noch einmal probieren." },
      { status: 429, headers: { ...headers, "Retry-After": "600" } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400, headers });
  }

  // Honeypot: ausgefüllt → so tun, als ob alles geklappt hätte, aber nichts speichern
  const honeypot = (body as Record<string, unknown>).website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return NextResponse.json({ ok: true }, { headers });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? "Bitte die Angaben prüfen.", field: first?.path.join(".") ?? null },
      { status: 400, headers }
    );
  }

  const organizationId = await resolvePublicOrganizationId();
  if (!organizationId) {
    console.error("[stammgast] Keine Organisation gefunden (PUBLIC_ORG_SLUG prüfen)");
    return NextResponse.json({ ok: false, error: "Eintragung gerade nicht möglich." }, { status: 503, headers });
  }

  try {
    await signupRegularGuest(organizationId, parsed.data);
  } catch (err) {
    console.error("[stammgast] Speichern fehlgeschlagen:", err instanceof Error ? err.name : "Fehler");
    return NextResponse.json({ ok: false, error: "Eintragung gerade nicht möglich." }, { status: 500, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
