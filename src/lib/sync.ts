import { prisma } from "./prisma";
import { fetchSmoobuReservations, fetchSmoobuApartments } from "./smoobu";
import { addDays, format, subDays } from "date-fns";

export async function syncBookings(organizationId: string): Promise<{
  created: number;
  updated: number;
  cancelled: number;
  apartmentsImported: number;
}> {
  const stats = { created: 0, updated: 0, cancelled: 0, apartmentsImported: 0 };

  // Apartments von Smoobu importieren / aktualisieren
  const smoobuApartments = await fetchSmoobuApartments();
  for (const sa of smoobuApartments) {
    const existing = await prisma.apartment.findFirst({
      where: { smoobuId: sa.id, organizationId },
    });
    if (!existing) {
      await prisma.apartment.create({
        data: {
          organizationId,
          smoobuId: sa.id,
          name: sa.name,
          active: true,
        },
      });
      stats.apartmentsImported++;
    }
  }

  // Apartments dieser Organization die eine Smoobu-ID haben
  const apartments = await prisma.apartment.findMany({
    where: { organizationId, active: true, smoobuId: { not: null } },
  });

  if (apartments.length === 0) return stats;

  const smoobuIdToApartmentId = new Map(
    apartments.map((a) => [a.smoobuId!, a.id])
  );

  // Zeitraum: 30 Tage zurück bis 365 Tage voraus
  const from = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 365), "yyyy-MM-dd");

  const reservations = await fetchSmoobuReservations({ from, to });

  // Debug: erste Buchung loggen um Feldnamen zu sehen
  if (reservations.length > 0) {
    console.log("[sync] Beispiel-Buchung von Smoobu:", JSON.stringify(reservations[0], null, 2));
  }

  for (const res of reservations) {
    // Nur echte Buchungen, keine Blockierungen
    if (res.type !== "reservation") continue;

    const apartmentId = smoobuIdToApartmentId.get(res.apartment.id);
    if (!apartmentId) continue;

    // Smoobu uses different field names depending on API version
    // Try all known variants for check-in/check-out
    const raw = res as unknown as Record<string, unknown>;
    const checkInStr =
      (raw["check-in"] as string) ??
      (raw["arrival"] as string) ??
      (raw["checkIn"] as string) ??
      (raw["check_in"] as string);
    const checkOutStr =
      (raw["check-out"] as string) ??
      (raw["departure"] as string) ??
      (raw["checkOut"] as string) ??
      (raw["check_out"] as string);

    if (!checkInStr || !checkOutStr) {
      console.warn(`[sync] Buchung ${res.id}: kein Datum gefunden, überspringe. Felder:`, Object.keys(raw).join(", "));
      continue;
    }

    const checkIn = new Date(checkInStr);
    const checkOut = new Date(checkOutStr);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      console.warn(`[sync] Buchung ${res.id}: ungültiges Datum "${checkInStr}" / "${checkOutStr}", überspringe.`);
      continue;
    }

    const guestCount = (res.adults ?? 1) + (res.children ?? 0);
    const guestName = (raw["guest-name"] as string) ?? (raw["guestName"] as string) ?? "Unbekannt";
    const channelName = (raw["channel-name"] as string) ?? (raw["channelName"] as string) ?? null;
    const arrivalTime = (raw["arrival-time"] as string) ?? (raw["arrivalTime"] as string) ?? null;
    const departureTime = (raw["departure-time"] as string) ?? (raw["departureTime"] as string) ?? null;

    const existingBooking = await prisma.booking.findUnique({
      where: { smoobuId: res.id },
    });

    if (!existingBooking) {
      await prisma.booking.create({
        data: {
          organizationId,
          smoobuId: res.id,
          apartmentId,
          guestName,
          guestEmail: res.email ?? null,
          guestPhone: res.phone ?? null,
          guestCount,
          checkIn,
          checkOut,
          arrivalTime,
          departureTime,
          channelName,
          status: "confirmed",
          syncedAt: new Date(),
        },
      });
      stats.created++;
    } else {
      await prisma.booking.update({
        where: { smoobuId: res.id },
        data: {
          guestName,
          guestCount,
          checkIn,
          checkOut,
          arrivalTime,
          departureTime,
          channelName,
          syncedAt: new Date(),
        },
      });
      stats.updated++;
    }
  }

  return stats;
}
