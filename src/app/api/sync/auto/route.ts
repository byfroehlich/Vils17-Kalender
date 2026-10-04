import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runSyncIfStale } from "@/lib/sync-runner";
import { runReminders, maybeSendDailyStatus } from "@/lib/notifications";

export const maxDuration = 60;

// Älter als das → beim Öffnen der App neu bei Smoobu abfragen
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Selbstaktualisierung: Jede geöffnete App (Admin wie Reinigungskraft) ruft das
 * beim Öffnen und regelmäßig auf. Synchronisiert wird nur, wenn der letzte Lauf
 * älter als 10 Minuten ist — die App bleibt damit aktuell, auch wenn der Cron
 * ausfällt, ohne Smoobu bei jedem Seitenaufruf zu belasten.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const orgId = session.user.organizationId;
    const result = await runSyncIfStale(orgId, MAX_AGE_MS);

    // Rückfallebene für den Cron: Hat ein Sync stattgefunden (höchstens alle
    // 10 Min), auch Warnungen und Tagesstatus prüfen. Beides ist idempotent —
    // läuft der Cron, passiert hier schlicht nichts doppelt.
    if (result.synced) {
      await runReminders(orgId).catch((e) => console.error("[sync/auto] Warnungen:", e));
      await maybeSendDailyStatus(orgId).catch((e) => console.error("[sync/auto] Tagesstatus:", e));
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[sync/auto]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
