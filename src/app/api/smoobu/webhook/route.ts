import { NextRequest, NextResponse } from "next/server";
import { verifySmoobuWebhook } from "@/lib/smoobu";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-smoobu-signature") ?? "";

  // Webhook-Signatur prüfen (nur wenn Secret gesetzt)
  if (process.env.SMOOBU_WEBHOOK_SECRET && !verifySmoobuWebhook(payload, signature)) {
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  // Smoobu sendet entweder { action, object } oder direkt das Reservierungs-Objekt
  // Beide Formate normalisieren
  const action = (raw.action as string | undefined) ?? (raw.type as string | undefined) ?? "";
  const res: Record<string, unknown> = (raw.object as Record<string, unknown>) ?? raw;

  // Wohnung ermitteln (aus Smoobu-Apartment-ID)
  const smoobuApartmentId =
    (res.apartment as any)?.id ?? (res["apartment-id"] as number) ?? null;

  if (!smoobuApartmentId) {
    return NextResponse.json({ received: true });
  }

  const apartment = await prisma.apartment.findFirst({
    where: { smoobuId: smoobuApartmentId, active: true },
  });

  if (!apartment) {
    return NextResponse.json({ received: true });
  }

  const orgId = apartment.organizationId;
  const smoobuId = res.id as number;

  // Stornierung
  const isCancelled =
    action === "reservation.cancelled" ||
    action === "cancelReservation" ||
    (res.type as string) === "cancellation";

  if (isCancelled && smoobuId) {
    await prisma.booking.updateMany({
      where: { smoobuId, organizationId: orgId },
      data: { status: "cancelled" },
    });
    await logAudit({ organizationId: orgId, action: "booking.webhook.cancelled", entityId: String(smoobuId) });
    return NextResponse.json({ received: true });
  }

  // Neue oder geänderte Buchung
  const isReservation =
    action === "reservation.created" ||
    action === "reservation.modified" ||
    action === "newReservation" ||
    action === "modifyReservation" ||
    action === "" || // Smoobu sendet manchmal kein action-Feld
    (res.type as string) === "reservation";

  if (isReservation && smoobuId) {
    const checkIn = res["check-in"] as string;
    const checkOut = res["check-out"] as string;

    if (!checkIn || !checkOut) {
      return NextResponse.json({ received: true });
    }

    await prisma.booking.upsert({
      where: { smoobuId },
      create: {
        organizationId: orgId,
        smoobuId,
        apartmentId: apartment.id,
        guestName: (res["guest-name"] as string) ?? "Unbekannt",
        guestEmail: (res.email as string) ?? null,
        guestPhone: (res.phone as string) ?? null,
        guestCount: ((res.adults as number) ?? 1) + ((res.children as number) ?? 0),
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        arrivalTime: (res["arrival-time"] as string) ?? null,
        departureTime: (res["departure-time"] as string) ?? null,
        channelName: (res["channel-name"] as string) ?? null,
        status: "confirmed",
        syncedAt: new Date(),
      },
      update: {
        guestName: (res["guest-name"] as string) ?? undefined,
        guestCount: ((res.adults as number) ?? 1) + ((res.children as number) ?? 0),
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        arrivalTime: (res["arrival-time"] as string) ?? null,
        departureTime: (res["departure-time"] as string) ?? null,
        status: "confirmed",
        syncedAt: new Date(),
      },
    });

    await logAudit({
      organizationId: orgId,
      action: `booking.webhook.${action || "upsert"}`,
      entityType: "Booking",
      entityId: String(smoobuId),
    });
  }

  return NextResponse.json({ received: true });
}
