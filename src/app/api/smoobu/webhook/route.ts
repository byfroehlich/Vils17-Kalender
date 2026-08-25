import { NextRequest, NextResponse } from "next/server";
import { verifySmoobuWebhook } from "@/lib/smoobu";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-smoobu-signature") ?? "";

  // Webhook-Signatur prüfen — schlägt fehl wenn Secret nicht konfiguriert
  if (!verifySmoobuWebhook(payload, signature)) {
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
    (res.type as string) === "cancellation" ||
    (res["is-blocked-booking"] as boolean) === true;

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
    action === "" ||
    (res.type as string) === "reservation";

  if (isReservation && smoobuId) {
    // Smoobu nutzt "arrival"/"departure" für Datum
    // "check-in"/"check-out" sind Uhrzeiten (oft leer)
    const checkInStr = (res.arrival as string) ?? (res["check-in"] as string);
    const checkOutStr = (res.departure as string) ?? (res["check-out"] as string);

    if (!checkInStr || !checkOutStr) {
      console.warn("[webhook] Kein Datum gefunden für Buchung", smoobuId, "Felder:", Object.keys(res).join(", "));
      return NextResponse.json({ received: true });
    }

    const checkIn = new Date(checkInStr);
    const checkOut = new Date(checkOutStr);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      console.warn("[webhook] Ungültiges Datum für Buchung", smoobuId, checkInStr, checkOutStr);
      return NextResponse.json({ received: true });
    }

    const channelName = (res.channel as any)?.name ?? (res["channel-name"] as string) ?? null;
    const guestName = (res["guest-name"] as string) ?? (res.firstname as string) ?? "Unbekannt";

    // Von Hand korrigierte Gästezahl nicht überschreiben
    const existingBooking = await prisma.booking.findUnique({
      where: { smoobuId },
      select: { guestCountManual: true },
    });
    const guestCountFromSmoobu =
      ((res.adults as number) ?? 1) + ((res.children as number) ?? 0);

    await prisma.booking.upsert({
      where: { smoobuId },
      create: {
        organizationId: orgId,
        smoobuId,
        apartmentId: apartment.id,
        guestName,
        guestEmail: (res.email as string) ?? null,
        guestPhone: (res.phone as string) ?? null,
        guestCount: guestCountFromSmoobu,
        checkIn,
        checkOut,
        arrivalTime: (res["check-in"] as string) || null,
        departureTime: (res["check-out"] as string) || null,
        channelName,
        channelNotice: (res.notice as string) ?? null,
        status: "confirmed",
        syncedAt: new Date(),
      },
      update: {
        guestName,
        ...(existingBooking?.guestCountManual ? {} : { guestCount: guestCountFromSmoobu }),
        checkIn,
        checkOut,
        arrivalTime: (res["check-in"] as string) || null,
        departureTime: (res["check-out"] as string) || null,
        channelName,
        channelNotice: (res.notice as string) ?? null,
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
