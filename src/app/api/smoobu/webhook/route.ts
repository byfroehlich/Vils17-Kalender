import { NextRequest, NextResponse } from "next/server";
import { verifySmoobuWebhook } from "@/lib/smoobu";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-smoobu-signature") ?? "";

  // Webhook-Signatur prüfen
  if (process.env.SMOOBU_WEBHOOK_SECRET && !verifySmoobuWebhook(payload, signature)) {
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const eventType = event.type as string;

  // Alle Apartments mit Smoobu-IDs laden
  const apartments = await prisma.apartment.findMany({
    where: { smoobuId: { not: null }, active: true },
    include: { organization: true },
  });

  const smoobuApartmentId = (event.apartment as any)?.id;
  const apartment = apartments.find((a) => a.smoobuId === smoobuApartmentId);

  if (!apartment) {
    // Wohnung unbekannt – ignorieren
    return NextResponse.json({ received: true });
  }

  const orgId = apartment.organizationId;

  if (eventType === "reservation.created" || eventType === "reservation.modified") {
    const res = event as any;
    const smoobuId = res.id as number;

    await prisma.booking.upsert({
      where: { smoobuId },
      create: {
        organizationId: orgId,
        smoobuId,
        apartmentId: apartment.id,
        guestName: res["guest-name"] ?? "Unbekannt",
        guestEmail: res.email ?? null,
        guestPhone: res.phone ?? null,
        guestCount: (res.adults ?? 1) + (res.children ?? 0),
        checkIn: new Date(res["check-in"]),
        checkOut: new Date(res["check-out"]),
        arrivalTime: res["arrival-time"] ?? null,
        departureTime: res["departure-time"] ?? null,
        channelName: res["channel-name"] ?? null,
        status: "confirmed",
        syncedAt: new Date(),
      },
      update: {
        guestName: res["guest-name"] ?? undefined,
        guestCount: (res.adults ?? 1) + (res.children ?? 0),
        checkIn: new Date(res["check-in"]),
        checkOut: new Date(res["check-out"]),
        arrivalTime: res["arrival-time"] ?? null,
        departureTime: res["departure-time"] ?? null,
        status: "confirmed",
        syncedAt: new Date(),
      },
    });

    await logAudit({
      organizationId: orgId,
      action: `booking.webhook.${eventType}`,
      entityType: "Booking",
      entityId: String(smoobuId),
    });
  }

  if (eventType === "reservation.cancelled") {
    const smoobuId = (event as any).id as number;
    await prisma.booking.updateMany({
      where: { smoobuId, organizationId: orgId },
      data: { status: "cancelled" },
    });

    await logAudit({
      organizationId: orgId,
      action: "booking.webhook.cancelled",
      entityId: String(smoobuId),
    });
  }

  return NextResponse.json({ received: true });
}
