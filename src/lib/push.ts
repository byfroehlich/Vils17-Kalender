import webpush from "web-push";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

let initialized = false;
function init() {
  if (initialized) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO ?? "mailto:info@vils17.at";
  if (!pub || !priv) return;
  webpush.setVapidDetails(mailto, pub, priv);
  initialized = true;
}

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
  if (!initialized) return result;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  result.devices = subs.length;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        result.sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await removeExpiredSub(sub.id);
          result.removed++;
        } else {
          result.failed++;
          console.error("[push] Versand fehlgeschlagen:", status, (err as Error).message);
        }
      }
    })
  );

  return result;
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
