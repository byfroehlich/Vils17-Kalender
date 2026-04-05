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

  for (const res of reservations) {
    // Nur echte Buchungen, keine Blockierungen
    if (res.type !== "reservation") continue;

    const apartmentId = smoobuIdToApartmentId.get(res.apartment.id);
    if (!apartmentId) continue;

    const guestCount = (res.adults ?? 1) + (res.children ?? 0);

    const existingBooking = await prisma.booking.findUnique({
      where: { smoobuId: res.id },
    });

    if (!existingBooking) {
      await prisma.booking.create({
        data: {
          organizationId,
          smoobuId: res.id,
          apartmentId,
          guestName: res["guest-name"] ?? "Unbekannt",
          guestEmail: res.email ?? null,
          guestPhone: res.phone ?? null,
          guestCount,
          checkIn: new Date(res["check-in"]),
          checkOut: new Date(res["check-out"]),
          arrivalTime: res["arrival-time"] ?? null,
          departureTime: res["departure-time"] ?? null,
          channelName: res["channel-name"] ?? null,
          status: "confirmed",
          syncedAt: new Date(),
        },
      });
      stats.created++;
    } else {
      await prisma.booking.update({
        where: { smoobuId: res.id },
        data: {
          guestName: res["guest-name"] ?? existingBooking.guestName,
          guestCount,
          checkIn: new Date(res["check-in"]),
          checkOut: new Date(res["check-out"]),
          arrivalTime: res["arrival-time"] ?? null,
          departureTime: res["departure-time"] ?? null,
          channelName: res["channel-name"] ?? null,
          syncedAt: new Date(),
        },
      });
      stats.updated++;
    }
  }

  return stats;
}
