import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { dreameLogin, dreameGetDeviceId, dreameGetStatus, dreameIsDone } from "@/lib/dreame";
import { sendPushToRole } from "@/lib/push";

// Runs every 30 min. Only acts between 08:30–12:00 UTC (= 10:30–14:00 Vienna) on checkout days.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const nowUtc = new Date();
  const utcHour = nowUtc.getUTCHours();
  const utcMin = nowUtc.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMin;
  // 08:30–12:00 UTC
  if (utcMinutes < 8 * 60 + 30 || utcMinutes > 12 * 60) {
    return NextResponse.json({ skipped: true, reason: "Außerhalb des Zeitfensters" });
  }

  const aptId = process.env.DREAME_APARTMENT_ID;
  const email = process.env.DREAME_EMAIL;
  const password = process.env.DREAME_PASSWORD;
  if (!aptId || !email || !password) {
    return NextResponse.json({ skipped: true, reason: "Dreame env vars fehlen" });
  }

  const apartment = await prisma.apartment.findUnique({
    where: { id: aptId },
    select: { dreameEnabled: true },
  });

  if (!apartment?.dreameEnabled) {
    return NextResponse.json({ skipped: true, reason: "Dreame in Einstellungen deaktiviert" });
  }

  const todayStart = startOfDay(nowUtc);
  const todayEnd = endOfDay(nowUtc);

  const booking = await prisma.booking.findFirst({
    where: {
      apartmentId: aptId,
      status: "confirmed",
      checkOut: { gte: todayStart, lte: todayEnd },
    },
    include: {
      apartment: { select: { organizationId: true, name: true } },
      cleaningAssignment: { select: { id: true, dreameStartedAt: true, dreameDoneAt: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ skipped: true, reason: "Kein Checkout heute" });
  }

  const assignment = booking.cleaningAssignment;
  if (!assignment?.dreameStartedAt) {
    return NextResponse.json({ skipped: true, reason: "Roboter wurde heute nicht gestartet" });
  }

  if (assignment.dreameDoneAt) {
    return NextResponse.json({ skipped: true, reason: "Fertig-Push bereits gesendet" });
  }

  const token = await dreameLogin(email, password);
  const deviceId = await dreameGetDeviceId(token);
  const status = await dreameGetStatus(token, deviceId);

  if (!dreameIsDone(status)) {
    return NextResponse.json({ ok: true, status, done: false, message: "Roboter noch am Reinigen" });
  }

  await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: { dreameDoneAt: new Date() },
  });

  const orgId = booking.apartment.organizationId;
  const aptName = booking.apartment.name;

  await sendPushToRole(orgId, ["ADMIN", "MANAGER"], {
    title: "✅ Saugroboter fertig",
    body: `${aptName}: Reinigung abgeschlossen, Roboter in Dockingstation`,
    url: `/bookings/${booking.id}`,
  });

  return NextResponse.json({ ok: true, status, done: true });
}
