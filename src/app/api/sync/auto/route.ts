import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAutoSync } from "@/lib/sync-runner";

export const maxDuration = 60;

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
    // Gleiche Logik wie das MCP-Tool sync_ausloesen (lib/sync-runner)
    const result = await runAutoSync(session.user.organizationId);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[sync/auto]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
