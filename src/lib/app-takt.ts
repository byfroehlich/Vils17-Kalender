import { prisma } from "./prisma";
import { runAutoSync } from "./sync-runner";
import { runDreame } from "./dreame-runner";
import { cleanupWebsiteData } from "./website-analytics";

// ─── Takt der App (ersetzt externe Cron-Dienste) ──────────────────────────────
// Der Web-Dienst auf Render läuft dauerhaft (bezahlter Plan, kein Einschlafen).
// Er stößt sich deshalb alle 5 Minuten selbst an: Smoobu-Abgleich, Portal-Mail-
// Import, Erinnerungen, Tagesstatus (über runAutoSync, höchstens alle 10 Min) und
// den Saugroboter (jeder Takt — Start pünktlich ab 10:00), dazu einmal pro Stunde
// das Aufräumen der Website-Messdaten (älter als 13 Monate). Alles ist idempotent;
// Cron-Routen und Auto-Sync der geöffneten Apps bleiben als zweiter Weg erhalten.

export const TAKT_MS = 5 * 60 * 1000;

/** Website-Messdaten höchstens so oft aufräumen */
export const WEBSITE_CLEANUP_MS = 60 * 60 * 1000;
let lastWebsiteCleanup = 0;

export function resetTaktState() {
  lastWebsiteCleanup = 0;
}

export async function runTakt(now = new Date()): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const cleanup = now.getTime() - lastWebsiteCleanup >= WEBSITE_CLEANUP_MS;
  if (cleanup) lastWebsiteCleanup = now.getTime();
  for (const { id } of orgs) {
    let synced = false;
    try {
      synced = (await runAutoSync(id)).synced; // enthält bei synced=true auch den Saugroboter
    } catch (e) {
      console.error("[takt] Abgleich:", e instanceof Error ? e.message : e);
    }
    if (!synced) {
      await runDreame({ organizationId: id }).catch((e) => console.error("[takt] Saugroboter:", e instanceof Error ? e.message : e));
    }
    if (cleanup) {
      await cleanupWebsiteData(id, now).catch((e) => console.error("[takt] Website-Messdaten:", e instanceof Error ? e.message : e));
    }
  }
}

let started = false;
let busy = false;

/** Einmal pro Server-Prozess starten (instrumentation.ts). APP_TAKT=off schaltet ab. */
export function startTakt(): void {
  if (started || process.env.APP_TAKT === "off" || process.env.NODE_ENV !== "production") return;
  started = true;
  const tick = async () => {
    if (busy) return; // ein Lauf dauert länger als der Takt → überspringen
    busy = true;
    try {
      await runTakt();
    } catch (e) {
      console.error("[takt]", e instanceof Error ? e.message : e);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 60_000); // erster Lauf kurz nach dem Start
  setInterval(tick, TAKT_MS).unref();
  console.log("[takt] gestartet: alle 5 Minuten");
}
