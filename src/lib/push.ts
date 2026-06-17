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

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  init();
  if (!initialized) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await removeExpiredSub(sub.id);
        }
      }
    })
  );
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
