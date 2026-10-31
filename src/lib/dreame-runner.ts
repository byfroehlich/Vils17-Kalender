import { prisma } from "./prisma";
import { dreameLogin, dreameGetDeviceId, dreameStartCleaning, dreameGetStatus, dreameIsDone } from "./dreame";
import { sendPushToRole } from "./push";
import { todayVienna } from "./mcp/format";
import { logAudit } from "./audit";

// ─── Saugroboter (Dreame) am Abreisetag ───────────────────────────────────────
// Entscheidung Mathias 31.10.2026: Start um 10:00 Uhr (Check-out-Zeit) am Abreisetag,
// egal wann die Gäste tatsächlich gehen. Gilt für jede Wohnung mit dreameEnabled
// (derzeit nur Penthouse). Warnungen als Push an Admin/Verwaltung.
//
// Idempotent: kann beliebig oft laufen (Cron, Auto-Sync). Jeder Schritt wird am
// Reinigungsauftrag festgehalten: dreameStartedAt, dreameDoneAt, dreameWarnedAt.

export const DREAME_START_MINUTE = 10 * 60; // 10:00 Wiener Zeit
/** Nach so vielen Minuten ohne „fertig“ wird gewarnt */
export const DREAME_MAX_RUN_MINUTES = 180;
/** Fehlerzustände laut Gerät (siid 2, piid 2) */
const ERROR_STATES = [4];

export type DreameStep =
  | { apartment: string; action: "skipped"; reason: string }
  | { apartment: string; action: "started" | "done" | "running" | "warned"; detail?: string };

function viennaMinutes(now: Date): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(now).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface DreameClient {
  start(): Promise<void>;
  status(): Promise<number>;
}

/** Echter Zugriff über die Dreame-Cloud; null = Zugangsdaten fehlen */
async function cloudClient(): Promise<DreameClient | null> {
  const email = process.env.DREAME_EMAIL;
  const password = process.env.DREAME_PASSWORD;
  if (!email || !password) return null;
  let session: { token: string; deviceId: string } | null = null;
  const connect = async () => {
    if (!session) {
      const token = await dreameLogin(email, password);
      session = { token, deviceId: await dreameGetDeviceId(token) };
    }
    return session;
  };
  return {
    async start() { const s = await connect(); await dreameStartCleaning(s.token, s.deviceId); },
    async status() { const s = await connect(); return dreameGetStatus(s.token, s.deviceId); },
  };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function runDreame(params: { organizationId: string; now?: Date; client?: DreameClient | null }): Promise<DreameStep[]> {
  const now = params.now ?? new Date();
  const apartments = await prisma.apartment.findMany({
    where: { organizationId: params.organizationId, dreameEnabled: true },
    select: { id: true, name: true },
  });
  if (!apartments.length) return [];

  const minutes = viennaMinutes(now);
  if (minutes < DREAME_START_MINUTE) return apartments.map((a) => ({ apartment: a.name, action: "skipped", reason: "vor 10:00" }));

  const client = params.client !== undefined ? params.client : await cloudClient();
  const steps: DreameStep[] = [];
  const today = todayVienna(now);

  for (const apt of apartments) {
    const booking = await prisma.booking.findFirst({
      where: { organizationId: params.organizationId, apartmentId: apt.id, status: "confirmed", checkOut: today },
      select: { id: true, cleaningAssignment: { select: { id: true, dreameStartedAt: true, dreameDoneAt: true, dreameWarnedAt: true } } },
    });
    const a = booking?.cleaningAssignment;
    if (!booking || !a) { steps.push({ apartment: apt.name, action: "skipped", reason: "keine Abreise heute" }); continue; }
    if (a.dreameDoneAt) { steps.push({ apartment: apt.name, action: "skipped", reason: "heute schon fertig" }); continue; }

    const warn = async (body: string) => {
      if (a.dreameWarnedAt) return;
      await prisma.cleaningAssignment.update({ where: { id: a.id }, data: { dreameWarnedAt: now } });
      await sendPushToRole(params.organizationId, ["ADMIN", "MANAGER"], { title: "⚠️ Saugroboter", body: `${apt.name}: ${body}`, url: `/bookings/${booking.id}` });
      await logAudit({ organizationId: params.organizationId, action: "dreame.warning", entityType: "CleaningAssignment", entityId: a.id, details: { meldung: body } });
      steps.push({ apartment: apt.name, action: "warned", detail: body });
    };

    if (!client) { await warn("Zugangsdaten fehlen (DREAME_EMAIL / DREAME_PASSWORD) — Roboter wurde nicht gestartet."); continue; }

    // 1. Starten
    if (!a.dreameStartedAt) {
      try {
        await client.start();
      } catch (e) {
        await warn(`Start fehlgeschlagen — bitte in der Dreame-App starten. (${errText(e)})`);
        continue;
      }
      await prisma.cleaningAssignment.update({ where: { id: a.id }, data: { dreameStartedAt: now } });
      await sendPushToRole(params.organizationId, ["ADMIN", "MANAGER"], { title: "🤖 Saugroboter gestartet", body: `${apt.name}: Reinigung läuft`, url: `/bookings/${booking.id}` });
      await logAudit({ organizationId: params.organizationId, action: "dreame.started", entityType: "CleaningAssignment", entityId: a.id });
      steps.push({ apartment: apt.name, action: "started" });
      continue; // Status erst beim nächsten Lauf prüfen
    }

    // 2. Überwachen
    let status: number;
    try {
      status = await client.status();
    } catch (e) {
      await warn(`Status nicht abrufbar. (${errText(e)})`);
      continue;
    }
    if (dreameIsDone(status)) {
      await prisma.cleaningAssignment.update({ where: { id: a.id }, data: { dreameDoneAt: now } });
      await sendPushToRole(params.organizationId, ["ADMIN", "MANAGER"], { title: "✅ Saugroboter fertig", body: `${apt.name}: Reinigung abgeschlossen`, url: `/bookings/${booking.id}` });
      steps.push({ apartment: apt.name, action: "done" });
      continue;
    }
    if (ERROR_STATES.includes(status)) { await warn("Störung gemeldet (steckt fest oder Fehler) — bitte in der Dreame-App nachsehen."); continue; }
    const runMinutes = (now.getTime() - a.dreameStartedAt.getTime()) / 60_000;
    if (runMinutes > DREAME_MAX_RUN_MINUTES) { await warn(`läuft seit über ${DREAME_MAX_RUN_MINUTES / 60} Stunden — bitte prüfen.`); continue; }
    steps.push({ apartment: apt.name, action: "running", detail: `Status ${status}` });
  }
  return steps;
}
