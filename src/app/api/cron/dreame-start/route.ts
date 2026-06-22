import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { dreameLogin, dreameGetDeviceId, dreameStartCleaning } from "@/lib/dreame";
import { sendPushToRole } from "@/lib/push";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const aptId = process.env.DREAME_APARTMENT_ID;
  if (!aptId) {
    return NextResponse.json({ skipped: true, reason: "DREAME_APARTMENT_ID not set" });
  }

  const email = process.env.DREAME_EMAIL;
  const password = process.env.DREAME_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ skipped: true, reason: "DREAME_EMAIL or DREAME_PASSWORD not set" });
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const apartment = await prisma.apartment.findUnique({
    where: { id: aptId },
    select: { dreameEnabled: true, organizationId: true },
  });

  if (!apartment?.dreameEnabled) {
    return NextResponse.json({ skipped: true, reason: "Dreame in Einstellungen deaktiviert" });
  }

  const booking = await prisma.booking.findFirst({
    where: {
      apartmentId: aptId,
      status: "confirmed",
      checkOut: { gte: todayStart, lte: todayEnd },
    },
    include: {
      apartment: { select: { organizationId: true, name: true } },
      cleaningAssignment: { select: { id: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ skipped: true, reason: "Kein Checkout heute für diese Wohnung" });
  }

  const orgId = booking.apartment.organizationId;
  const aptName = booking.apartment.name;

  if (dry) {
    return NextResponse.json({
      dry: true,
      bookingId: booking.id,
      apartment: aptName,
      message: "Dry run — Roboter wurde NICHT gestartet",
    });
  }

  const token = await dreameLogin(email, password);
  const deviceId = await dreameGetDeviceId(token);
  await dreameStartCleaning(token, deviceId);

  if (booking.cleaningAssignment) {
    await prisma.cleaningAssignment.update({
      where: { id: booking.cleaningAssignment.id },
      data: { dreameStartedAt: new Date() },
    });
  }

  await sendPushToRole(orgId, ["ADMIN", "MANAGER"], {
    title: "🤖 Saugroboter gestartet",
    body: `${aptName}: Reinigung läuft`,
    url: `/bookings/${booking.id}`,
  });

  return NextResponse.json({ ok: true, bookingId: booking.id, deviceId });
}
