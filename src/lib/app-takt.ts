import { prisma } from "./prisma";
import { runAutoSync } from "./sync-runner";
import { runDreame } from "./dreame-runner";

// ─── Takt der App (ersetzt externe Cron-Dienste) ──────────────────────────────
// Der Web-Dienst auf Render läuft dauerhaft (bezahlter Plan, kein Einschlafen).
// Er stößt sich deshalb alle 5 Minuten selbst an: Smoobu-Abgleich, Portal-Mail-
// Import, Erinnerungen, Tagesstatus (über runAutoSync, höchstens alle 10 Min) und
// den Saugroboter (jeder Takt — Start pünktlich ab 10:00). Alles ist idempotent;
// Cron-Routen und Auto-Sync der geöffneten Apps bleiben als zweiter Weg erhalten.

export const TAKT_MS = 5 * 60 * 1000;

export async function runTakt(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
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
