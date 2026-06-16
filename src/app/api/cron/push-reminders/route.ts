import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToRole } from "@/lib/push";
import { addDays, startOfDay, endOfDay } from "date-fns";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const now = new Date();
  const results = { cleanerReminders: 0, adminReminders: 0 };

  // ─── 10 Tage vor Abreise: Push an alle Reiniger ─────────────────────────
  // Reinigung findet bei Abreise (checkOut) statt, nicht bei Ankunft
  const in10Start = startOfDay(addDays(now, 10));
  const in10End = endOfDay(addDays(now, 10));

  const unassigned10 = await prisma.cleaningAssignment.findMany({
    where: {
      status: "UNASSIGNED",
      cleanerReminderSentAt: null,
      booking: {
        status: "confirmed",
        checkOut: { gte: in10Start, lte: in10End },
      },
    },
    include: {
      booking: { select: { checkIn: true, checkOut: true, apartment: { select: { name: true, organizationId: true } } } },
    },
  });

  for (const a of unassigned10) {
    const apt = a.booking.apartment.name;
    const orgId = a.booking.apartment.organizationId;
    const checkIn = new Date(a.booking.checkIn).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
    const checkOut = new Date(a.booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });

    await sendPushToRole(orgId, ["CLEANER"], {
      title: "Reinigung in 10 Tagen — noch frei!",
      body: `${apt}: Anreise ${checkIn}, Reinigung am ${checkOut}. Interesse?`,
      url: "/my-jobs/list",
    });

    await prisma.cleaningAssignment.update({
      where: { id: a.id },
      data: { cleanerReminderSentAt: now },
    });

    results.cleanerReminders++;
  }

  // ─── 7 Tage vor Abreise: Push an Admin/Manager ──────────────────────────
  const in7Start = startOfDay(addDays(now, 7));
  const in7End = endOfDay(addDays(now, 7));

  const unassigned7 = await prisma.cleaningAssignment.findMany({
    where: {
      status: "UNASSIGNED",
      adminReminderSentAt: null,
      booking: {
        status: "confirmed",
        checkOut: { gte: in7Start, lte: in7End },
      },
    },
    include: {
      booking: { select: { checkIn: true, checkOut: true, id: true, apartment: { select: { name: true, organizationId: true } } } },
    },
  });

  for (const a of unassigned7) {
    const apt = a.booking.apartment.name;
    const orgId = a.booking.apartment.organizationId;
    const checkOut = new Date(a.booking.checkOut).toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });

    await sendPushToRole(orgId, ["ADMIN", "MANAGER"], {
      title: "Reinigung noch nicht vergeben!",
      body: `${apt} am ${checkOut} — Anreise in 7 Tagen, noch keine Reinigungskraft`,
      url: `/bookings/${a.booking.id}`,
    });

    await prisma.cleaningAssignment.update({
      where: { id: a.id },
      data: { adminReminderSentAt: now },
    });

    results.adminReminders++;
  }

  return NextResponse.json({ ok: true, ...results });
}
