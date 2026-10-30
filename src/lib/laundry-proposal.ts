import { prisma } from "./prisma";
import { addDays } from "./mcp/format";
import { proposeLaundryOrder } from "./laundry-order";

/** Bestellvorschlag Wäsche für alle Anreisen ab start über `days` Tage — für App-Seite und MCP. */
export async function loadLaundryProposal(params: { organizationId: string; start: Date; days: number; apartmentId?: string | null }) {
  const end = addDays(params.start, params.days);
  const rows = await prisma.booking.findMany({
    where: {
      organizationId: params.organizationId,
      status: "confirmed",
      ...(params.apartmentId ? { apartmentId: params.apartmentId } : {}),
      checkIn: { gte: params.start, lt: end },
    },
    orderBy: { checkIn: "asc" },
    select: {
      id: true, guestName: true, guestCount: true, checkIn: true, apartmentId: true,
      apartment: { select: { name: true, laundryBedsDivisor: true, laundryTowelsPerGuest: true, laundryKitchenCount: true } },
      cleaningAssignment: { select: { laundryStatus: true } },
    },
  });
  const proposal = proposeLaundryOrder(
    rows.map((b) => ({ apartmentId: b.apartmentId, apartmentName: b.apartment.name, guestName: b.guestName, checkIn: b.checkIn, guestCount: b.guestCount, apartment: b.apartment }))
  );
  return { start: params.start, end, rows, proposal };
}
