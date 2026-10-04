import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runReminders, maybeSendDailyStatus } from "@/lib/notifications";

/**
 * Cron (alle 15 Min, nach dem Sync): Warnungen und Tagesstatus.
 * Die Logik liegt in src/lib/notifications.ts und wird zusätzlich von
 * /api/sync/auto genutzt — Warnungen kommen also auch, wenn der Cron ausfällt.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const results = [];
  for (const org of orgs) {
    const reminders = await runReminders(org.id);
    const dailyStatus = await maybeSendDailyStatus(org.id);
    results.push({ organizationId: org.id, ...reminders, dailyStatus });
  }

  return NextResponse.json({ ok: true, results });
}
