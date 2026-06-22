import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { dreameLogin, dreameGetDeviceId, dreameStartCleaning } from "@/lib/dreame";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

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

  const checkout = await prisma.booking.findFirst({
    where: {
      apartmentId: aptId,
      status: "confirmed",
      checkOut: { gte: todayStart, lte: todayEnd },
    },
  });

  if (!checkout) {
    return NextResponse.json({ skipped: true, reason: "Kein Checkout heute für diese Wohnung" });
  }

  const token = await dreameLogin(email, password);
  const deviceId = await dreameGetDeviceId(token);
  await dreameStartCleaning(token, deviceId);

  return NextResponse.json({ ok: true, bookingId: checkout.id, deviceId });
}
