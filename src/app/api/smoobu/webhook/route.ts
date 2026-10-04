import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { verifySmoobuWebhook } from "@/lib/smoobu";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { runSync } from "@/lib/sync-runner";

export const maxDuration = 60;

/**
 * Smoobu-Webhook → stößt einen vollständigen Sync an.
 *
 * Authentifizierung (eines von beiden):
 *  - `?token=<SMOOBU_WEBHOOK_SECRET>` in der Webhook-URL — so in Smoobu eintragen:
 *      https://<app>/api/smoobu/webhook?token=<SMOOBU_WEBHOOK_SECRET>
 *  - HMAC-Signatur im Header `x-smoobu-signature` (falls Smoobu signiert)
 *
 * Bewusst ein voller Sync statt eines Teil-Updates: Nur der Sync legt den
 * Reinigungsauftrag an, weist die Wohnungs-Reinigerin zu, verschickt Push und
 * erkennt Stornierungen. Ein Teil-Update aus dem Webhook hätte all das
 * übersprungen.
 */
function tokenMatches(token: string | null): boolean {
  const secret = process.env.SMOOBU_WEBHOOK_SECRET;
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-smoobu-signature") ?? "";
  const token = req.nextUrl.searchParams.get("token");

  if (!tokenMatches(token) && !verifySmoobuWebhook(payload, signature)) {
    console.warn("[webhook] Abgelehnt — weder gültiger Token noch gültige Signatur");
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Organization über die Smoobu-Wohnung bestimmen (Multi-Tenant-fähig)
  let organizationId: string | null = null;
  try {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    const res = (raw.object as Record<string, unknown>) ?? (raw.data as Record<string, unknown>) ?? raw;
    const smoobuApartmentId =
      ((res.apartment as { id?: number } | undefined)?.id) ?? (res["apartment-id"] as number | undefined) ?? null;
    if (smoobuApartmentId) {
      const apt = await prisma.apartment.findFirst({
        where: { smoobuId: smoobuApartmentId },
        select: { organizationId: true },
      });
      organizationId = apt?.organizationId ?? null;
    }
  } catch {
    // Kein JSON oder unbekanntes Format — dann unten auf die einzige Organization zurückfallen
  }

  if (!organizationId) {
    // V1: genau eine Organization
    const org = await prisma.organization.findFirst({ select: { id: true } });
    organizationId = org?.id ?? null;
  }
  if (!organizationId) {
    return NextResponse.json({ received: true, skipped: "keine Organization" });
  }

  try {
    const stats = await runSync(organizationId);
    await logAudit({
      organizationId,
      action: "booking.webhook.sync",
      details: stats as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ received: true, ...stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[webhook] Sync fehlgeschlagen:", msg);
    // 500 → Smoobu versucht es erneut
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
