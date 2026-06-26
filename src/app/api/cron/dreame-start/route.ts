import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dreameLogin, dreameGetDeviceId, dreameStartCleaning } from "@/lib/dreame";
import { sendPushToRole } from "@/lib/push";
import crypto from "crypto";

function viennaDay(): { start: Date; end: Date } {
  // Vienna is UTC+1 (winter) / UTC+2 (summer). We compute the current Vienna date
  // by formatting in Europe/Vienna and building UTC boundaries from it.
  const viennaStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" }); // "2026-07-01"
  const startUtc = new Date(`${viennaStr}T00:00:00+02:00`); // approximate, fine for ±day window
  const endUtc   = new Date(`${viennaStr}T23:59:59+02:00`);
  return { start: startUtc, end: endUtc };
}

function secretOk(provided: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (!secretOk(cronSecret)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const aptId = process.env.DREAME_APARTMENT_ID;
  if (!aptId) {
    return NextResponse.json({ skipped: true, reason: "DREAME_APARTMENT_ID not set" });
  }

  const email    = process.env.DREAME_EMAIL;
  const password = process.env.DREAME_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ skipped: true, reason: "DREAME_EMAIL or DREAME_PASSWORD not set" });
  }

  const apartment = await prisma.apartment.findUnique({
    where: { id: aptId },
    select: { dreameEnabled: true },
  });

  if (!apartment?.dreameEnabled) {
    return NextResponse.json({ skipped: true, reason: "Dreame in Einstellungen deaktiviert" });
  }

  const { start, end } = viennaDay();

  const booking = await prisma.booking.findFirst({
    where: {
      apartmentId: aptId,
      status: "confirmed",
      checkOut: { gte: start, lte: end },
    },
    include: {
      apartment: { select: { organizationId: true, name: true } },
      cleaningAssignment: { select: { id: true, dreameStartedAt: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ skipped: true, reason: "Kein Checkout heute für diese Wohnung" });
  }

  // Idempotency: don't start twice on cron retry
  if (booking.cleaningAssignment?.dreameStartedAt) {
    return NextResponse.json({ skipped: true, reason: "Roboter wurde heute bereits gestartet" });
  }

  const orgId   = booking.apartment.organizationId;
  const aptName = booking.apartment.name;

  if (dry) {
    return NextResponse.json({
      dry: true,
      bookingId: booking.id,
      apartment: aptName,
      message: "Dry run — Roboter wurde NICHT gestartet",
    });
  }

  const token    = await dreameLogin(email, password);
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

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
