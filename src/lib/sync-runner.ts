import { prisma } from "./prisma";
import { syncBookings } from "./sync";

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
