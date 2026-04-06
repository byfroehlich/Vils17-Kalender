import { prisma } from "./prisma";
import { getChannelManagerAdapter } from "./channel-manager";
import { addDays, format, subDays } from "date-fns";

export async function syncBookings(organizationId: string): Promise<{
  created: number;
  updated: number;
  cancelled: number;
  apartmentsImported: number;
}> {
  const stats = { created: 0, updated: 0, cancelled: 0, apartmentsImported: 0 };
  const adapter = getChannelManagerAdapter();

  // ─── 1. Apartments importieren ───────────────────────────────────────────
  const remoteApartments = await adapter.fetchApartments();

  for (const apt of remoteApartments) {
    const existing = await prisma.apartment.findFirst({
      where: { smoobuId: apt.externalId, organizationId },
    });
    if (!existing) {
      await prisma.apartment.create({
        data: {
          organizationId,
          smoobuId: apt.externalId,
          name: apt.name,
          active: true,
        },
      });
      stats.apartmentsImported++;
      console.log(`[sync] Neue Unterkunft importiert: "${apt.name}" (ID ${apt.externalId})`);
    }
  }

  // ─── 2. Apartments dieser Organization laden ─────────────────────────────
  const apartments = await prisma.apartment.findMany({
    where: { organizationId, active: true, smoobuId: { not: null } },
  });

  if (apartments.length === 0) {
    console.warn("[sync] Keine Apartments mit externer ID gefunden.");
    return stats;
  }

  const externalIdToApartmentId = new Map(
    apartments.map((a) => [a.smoobuId!, a.id])
  );

  // ─── 3. Buchungen abrufen (365 Tage zurück bis 365 voraus) ─────────────────
  const from = format(subDays(new Date(), 365), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 365), "yyyy-MM-dd");

  const reservations = await adapter.fetchReservations({ from, to });
  console.log(`[sync] ${reservations.length} Buchungen von ${adapter.name} erhalten`);

  // ─── 3b. Fehlende CleaningAssignments für bestehende Buchungen nachholen ──
  const bookingsWithoutAssignment = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      cleaningAssignment: null,
    },
    select: { id: true },
  });
  for (const b of bookingsWithoutAssignment) {
    await prisma.cleaningAssignment.create({
      data: { organizationId, bookingId: b.id, status: "UNASSIGNED", laundryStatus: "OPEN" },
    });
  }
  if (bookingsWithoutAssignment.length > 0) {
    console.log(`[sync] ${bookingsWithoutAssignment.length} fehlende CleaningAssignments nachgeholt`);
  }

  // ─── 4. Buchungen upserten ───────────────────────────────────────────────
  const syncedSmoobuIds = new Set<number>();

  for (const res of reservations) {
    const apartmentId = externalIdToApartmentId.get(res.apartmentExternalId);
    if (!apartmentId) continue;

    syncedSmoobuIds.add(res.externalId);

    const existing = await prisma.booking.findUnique({
      where: { smoobuId: res.externalId },
    });

    if (!existing) {
      const booking = await prisma.booking.create({
        data: {
          organizationId,
          smoobuId: res.externalId,
          apartmentId,
          guestName: res.guestName,
          guestEmail: res.guestEmail,
          guestPhone: res.guestPhone,
          guestCount: res.guestCount,
          checkIn: res.checkIn,
          checkOut: res.checkOut,
          arrivalTime: res.arrivalTime,
          departureTime: res.departureTime,
          channelName: res.channelName,
          price: res.price,
          currency: res.currency ?? "EUR",
          status: "confirmed",
          syncedAt: new Date(),
        },
      });
      // CleaningAssignment automatisch anlegen
      await prisma.cleaningAssignment.create({
        data: {
          organizationId,
          bookingId: booking.id,
          status: "UNASSIGNED",
          laundryStatus: "OPEN",
        },
      });
      stats.created++;
    } else {
      await prisma.booking.update({
        where: { smoobuId: res.externalId },
        data: {
          guestName: res.guestName,
          guestCount: res.guestCount,
          checkIn: res.checkIn,
          checkOut: res.checkOut,
          arrivalTime: res.arrivalTime,
          departureTime: res.departureTime,
          channelName: res.channelName,
          price: res.price,
          currency: res.currency ?? "EUR",
          status: "confirmed",
          syncedAt: new Date(),
        },
      });
      stats.updated++;
    }
  }

  // ─── 5. Stornierte Buchungen erkennen ────────────────────────────────────
  // Buchungen im Sync-Zeitraum die von Smoobu nicht mehr zurückgegeben wurden
  // → wurden storniert (Webhook verpasst) → als cancelled markieren
  const staleBookings = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "confirmed",
      smoobuId: { not: null },
      checkIn: { gte: new Date(from), lte: new Date(to) },
      NOT: {
        smoobuId: { in: Array.from(syncedSmoobuIds) },
      },
    },
    include: { cleaningAssignment: true },
  });

  for (const booking of staleBookings) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled", syncedAt: new Date() },
    });

    // CleaningAssignment: UNASSIGNED → stornieren (löschen), sonst Status-Note setzen
    if (booking.cleaningAssignment) {
      if (booking.cleaningAssignment.status === "UNASSIGNED") {
        await prisma.cleaningAssignment.delete({
          where: { id: booking.cleaningAssignment.id },
        });
      } else {
        // Bereits zugewiesen/erledigt: nur Notiz setzen, nicht löschen (für Statistik)
        await prisma.cleaningAssignment.update({
          where: { id: booking.cleaningAssignment.id },
          data: { laundryStatus: "OPEN", notes: "[Buchung storniert]" },
        });
      }
    }

    console.log(`[sync] Storniert: "${booking.guestName}" (SmoobuID ${booking.smoobuId})`);
    stats.cancelled++;
  }

  return stats;
}
