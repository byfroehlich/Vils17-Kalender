import webpush from "web-push";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

let initialized = false;
let initError: string | null = null;

/** VAPID_MAILTO darf als reine Adresse eingetragen sein – web-push verlangt "mailto:" bzw. eine URL. */
export function normalizeVapidSubject(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "mailto:info@vils17.at";
  if (/^(mailto:|https?:\/\/)/i.test(v)) return v;
  if (v.includes("@")) return `mailto:${v}`;
  return "mailto:info@vils17.at";
}

function init() {
  if (initialized) return;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    initError = !pub ? "VAPID_PUBLIC_KEY fehlt" : "VAPID_PRIVATE_KEY fehlt";
    return;
  }
  try {
    webpush.setVapidDetails(normalizeVapidSubject(process.env.VAPID_MAILTO), pub, priv);
    initialized = true;
    initError = null;
  } catch (err) {
    // Früher stürzte hier jeder Versand ab (z. B. VAPID_MAILTO ohne "mailto:") – jetzt sichtbar statt still.
    initError = `VAPID-Schlüssel ungültig: ${(err as Error).message}`;
    console.error("[push]", initError);
  }
}

/** Letzte Versandergebnisse (im Speicher des laufenden Dienstes) für die Diagnose. */
type SendLog = { at: Date; devices: number; sent: number; failed: number; removed: number; lastError: string | null };
let lastSend: SendLog | null = null;
let lastFailure: { at: Date; status: number | null; message: string } | null = null;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

async function removeExpiredSub(id: string) {
  await prisma.pushSubscription.delete({ where: { id } }).catch(() => null);
}

export type PushResult = {
  /** Push-Dienst nicht eingerichtet (VAPID-Schlüssel fehlen) */
  notConfigured: boolean;
  /** angemeldete Geräte */
  devices: number;
  sent: number;
  failed: number;
  /** abgelaufene Anmeldungen, die entfernt wurden */
  removed: number;
};

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  init();
  const result: PushResult = { notConfigured: !initialized, devices: 0, sent: 0, failed: 0, removed: 0 };
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return result;

  const subs = initialized ? await prisma.pushSubscription.findMany({ where: { userId: { in: ids } } }) : [];
  result.devices = subs.length;
  const perUser = new Map<string, { devices: number; sent: number; failed: number; removed: number; error: string | null }>();
  for (const id of ids) perUser.set(id, { devices: 0, sent: 0, failed: 0, removed: 0, error: initialized ? null : initError ?? "Push nicht eingerichtet" });

  await Promise.allSettled(
    subs.map(async (sub) => {
      const u = perUser.get(sub.userId)!;
      u.devices++;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        result.sent++; u.sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await removeExpiredSub(sub.id);
          result.removed++; u.removed++;
          u.error = "Anmeldung abgelaufen – Gerät entfernt";
        } else {
          result.failed++; u.failed++;
          const message = (err as Error).message.slice(0, 300);
          lastFailure = { at: new Date(), status: status ?? null, message };
          u.error = `Versand fehlgeschlagen${status ? ` (${status})` : ""}`;
          console.error("[push] Versand fehlgeschlagen:", status, (err as Error).message);
        }
      }
    })
  );

  if (initialized) lastSend = { at: new Date(), ...result, lastError: lastFailure?.message ?? null };
  await writePushLog(ids, payload.title, perUser).catch((e) => console.error("[push] Protokoll:", (e as Error).message));
  return result;
}

async function writePushLog(
  ids: string[],
  title: string,
  perUser: Map<string, { devices: number; sent: number; failed: number; removed: number; error: string | null }>
) {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, organizationId: true } });
  if (users.length === 0) return;
  await prisma.pushLog.createMany({
    data: users.map((u) => {
      const r = perUser.get(u.id)!;
      return {
        organizationId: u.organizationId, userId: u.id, userName: u.name.trim(), title: title.slice(0, 200),
        devices: r.devices, sent: r.sent, failed: r.failed, removed: r.removed,
        error: r.devices === 0 && !r.error ? "kein Gerät angemeldet" : r.error,
      };
    }),
  });
}

/** Versandprotokoll der letzten Pushes (neueste zuerst). */
export async function listPushLog(organizationId: string, opts: { userId?: string; limit?: number } = {}) {
  return prisma.pushLog.findMany({
    where: { organizationId, ...(opts.userId ? { userId: opts.userId } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
}

/** Diagnose: ist Push eingerichtet, wer hat wie viele Geräte angemeldet, was ist zuletzt passiert. */
export async function pushDiagnostics(orgId: string) {
  init();
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      name: true, role: true, active: true,
      pushSubscriptions: { select: { endpoint: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });
  return {
    configured: initialized,
    initError,
    publicKeySet: !!process.env.VAPID_PUBLIC_KEY,
    privateKeySet: !!process.env.VAPID_PRIVATE_KEY,
    subject: normalizeVapidSubject(process.env.VAPID_MAILTO),
    users: users.map((u) => ({
      name: u.name,
      role: u.role,
      active: u.active,
      devices: u.pushSubscriptions.length,
      services: Array.from(new Set(u.pushSubscriptions.map((s) => { try { return new URL(s.endpoint).host; } catch { return "?"; } }))),
      newest: u.pushSubscriptions[0]?.createdAt ?? null,
    })),
    lastSend,
    lastFailure,
  };
}

export async function sendPushToRole(
  orgId: string,
  roles: Role[],
  payload: PushPayload,
  excludeUserIds?: string[]
) {
  const users = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      role: { in: roles },
      active: true,
      ...(excludeUserIds?.length ? { id: { notIn: excludeUserIds } } : {}),
    },
    select: { id: true },
  });
  await sendPushToUsers(users.map((u) => u.id), payload);
}
