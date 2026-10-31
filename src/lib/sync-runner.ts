import { runEmailImport } from "./email-import/run";
import { isImapConfigured } from "./email-import/imap";
import { prisma } from "./prisma";
import { syncBookings } from "./sync";
import { runReminders, maybeSendDailyStatus } from "./notifications";

type SyncStats = Awaited<ReturnType<typeof syncBookings>>;

// Pro Organization läuft höchstens ein Sync gleichzeitig. Kommen Cron, Webhook
// und mehrere geöffnete Apps zeitgleich, hängen sich alle an denselben Lauf.
const running = new Map<string, Promise<SyncStats>>();

/** Führt einen Smoobu-Sync aus und merkt sich den Zeitpunkt. */
export function runSync(organizationId: string): Promise<SyncStats> {
  const inFlight = running.get(organizationId);
  if (inFlight) return inFlight;

  const job = (async () => {
    try {
      const stats = await syncBookings(organizationId);
      await prisma.organization.update({
        where: { id: organizationId },
        data: { lastSyncAt: new Date() },
      });
      return stats;
    } finally {
      running.delete(organizationId);
    }
  })();

  running.set(organizationId, job);
  return job;
}

/**
 * Synchronisiert nur, wenn der letzte Lauf älter als `maxAgeMs` ist.
 * Damit kann jede geöffnete App den Sync anstoßen, ohne Smoobu zu überlasten —
 * und die Daten bleiben aktuell, selbst wenn der Cron nicht läuft.
 */
export async function runSyncIfStale(
  organizationId: string,
  maxAgeMs: number
): Promise<{ synced: boolean; lastSyncAt: Date | null }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { lastSyncAt: true },
  });
  const last = org?.lastSyncAt ?? null;
  const age = last ? Date.now() - last.getTime() : Infinity;

  if (age < maxAgeMs) return { synced: false, lastSyncAt: last };

  await runSync(organizationId);
  return { synced: true, lastSyncAt: new Date() };
}

/** Älter als das → bei Smoobu neu abfragen (Selbstaktualisierung, MCP) */
export const AUTO_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Selbstaktualisierung wie beim Öffnen der App: synchronisiert nur, wenn der
 * letzte Lauf älter als 10 Min ist (oder `force`). Nach einem Sync laufen auch
 * Warnungen und Tagesstatus — beides idempotent, nichts kommt doppelt.
 */
export async function runAutoSync(organizationId: string, force = false) {
  const result = force
    ? (await runSync(organizationId), { synced: true, lastSyncAt: new Date() })
    : await runSyncIfStale(organizationId, AUTO_SYNC_MAX_AGE_MS);

  if (result.synced) {
    // Portal-Mails (Gästezahl, Hund) — Rückfallebene, falls der Cron email-import nicht läuft
    if (isImapConfigured()) await runEmailImport(organizationId).catch((e) => console.error("[sync] Mail-Import:", e instanceof Error ? e.message : e));
    await runReminders(organizationId).catch((e) => console.error("[sync] Warnungen:", e));
    await maybeSendDailyStatus(organizationId).catch((e) => console.error("[sync] Tagesstatus:", e));
  }
  return result;
}
