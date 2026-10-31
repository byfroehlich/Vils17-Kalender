import { prisma } from "./prisma";
import { addDays, todayVienna } from "./mcp/format";
import { planLaundry, normalizeQuantity, DEFAULT_RESERVE } from "./laundry-order";
import { logAudit } from "./audit";
import type { LaundryQuantity } from "./laundry-quantity";
import type { Actor } from "./booking-actions";

// Wäsche-Plan aus der Datenbank — gemeinsam für App-Seite und MCP.
// Der Keller ist einer für beide Wohnungen: Bestand und Bestellung gelten gemeinsam.

export async function loadLaundryPlan(params: { organizationId: string; today: Date; days: number }) {
  const { organizationId, today } = params;
  const end = addDays(today, params.days);

  const [org, count, deliveries] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { laundryReserve: true } }),
    prisma.laundryCount.findFirst({ where: { organizationId }, orderBy: [{ countedOn: "desc" }, { createdAt: "desc" }] }),
    prisma.laundryDelivery.findMany({ where: { organizationId, cancelled: false }, orderBy: { deliveryOn: "asc" } }),
  ]);

  const from = count ? addDays(count.countedOn, 1) : today;
  const rows = await prisma.booking.findMany({
    where: { organizationId, status: "confirmed", checkIn: { gte: from < today ? from : today, lt: end } },
    orderBy: { checkIn: "asc" },
    select: {
      id: true, guestName: true, guestCount: true, checkIn: true, apartmentId: true,
      apartment: { select: { name: true, laundryBedsDivisor: true, laundryTowelsPerGuest: true, laundryKitchenCount: true, laundryBeds: true } },
    },
  });

  const plan = planLaundry({
    arrivals: rows.map((b) => ({ apartmentId: b.apartmentId, apartmentName: b.apartment.name, guestName: b.guestName, checkIn: b.checkIn, guestCount: b.guestCount, apartment: b.apartment })),
    count: count ? { countedOn: count.countedOn, quantities: normalizeQuantity(count.quantities) } : null,
    deliveries: deliveries.map((d) => ({
      deliveryOn: d.deliveryOn,
      // Ankunft als Kalendertag in Wien
      arrivedOn: d.arrivedAt ? todayVienna(d.arrivedAt) : null,
      quantities: normalizeQuantity(d.quantities),
    })),
    today,
    end,
    // Teile, die in einer älteren gespeicherten Reserve fehlen (z.B. neue Spannbettlaken-Größen), bekommen die Vorgabe
    reserve: org.laundryReserve ? normalizeQuantity({ ...DEFAULT_RESERVE, ...(org.laundryReserve as object) }) : DEFAULT_RESERVE,
  });

  return {
    today,
    end,
    plan,
    count,
    /** bestellt, noch nicht im Keller angekommen (auch überfällige) */
    deliveries: deliveries.filter((d) => !d.arrivedAt),
    /** in den letzten 7 Tagen angekommen — nur zur Info */
    recentlyArrived: deliveries.filter((d) => d.arrivedAt && d.arrivedAt >= addDays(today, -7)),
    arrivalsInWindow: rows.filter((b) => b.checkIn >= today),
  };
}

export async function saveLaundryCount(params: { organizationId: string; countedOn: Date; quantities: LaundryQuantity; notes?: string | null; actor: Actor }) {
  const row = await prisma.laundryCount.create({
    data: {
      organizationId: params.organizationId,
      countedOn: params.countedOn,
      quantities: params.quantities as object,
      notes: params.notes?.trim() || null,
      createdById: params.actor.userId ?? null,
    },
  });
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "laundry.count.saved",
    entityType: "LaundryCount",
    entityId: row.id,
    details: { ...params.quantities, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return row;
}

export async function recordLaundryDelivery(params: { organizationId: string; deliveryOn: Date; quantities: LaundryQuantity; reference?: string | null; actor: Actor }) {
  const row = await prisma.laundryDelivery.create({
    data: {
      organizationId: params.organizationId,
      deliveryOn: params.deliveryOn,
      quantities: params.quantities as object,
      reference: params.reference?.trim() || null,
      createdById: params.actor.userId ?? null,
    },
  });
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "laundry.delivery.recorded",
    entityType: "LaundryDelivery",
    entityId: row.id,
    details: { ...params.quantities, ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return row;
}

export async function cancelLaundryDelivery(params: { organizationId: string; id: string; actor: Actor }) {
  const r = await prisma.laundryDelivery.updateMany({ where: { id: params.id, organizationId: params.organizationId }, data: { cancelled: true } });
  if (r.count) {
    await logAudit({ organizationId: params.organizationId, userId: params.actor.userId, action: "laundry.delivery.cancelled", entityType: "LaundryDelivery", entityId: params.id, details: params.actor.via ? { via: params.actor.via } : {} });
  }
  return r.count > 0;
}

export async function setLaundryReserve(params: { organizationId: string; reserve: LaundryQuantity; actor: Actor }) {
  await prisma.organization.update({ where: { id: params.organizationId }, data: { laundryReserve: params.reserve as object } });
  await logAudit({ organizationId: params.organizationId, userId: params.actor.userId, action: "laundry.reserve.updated", entityType: "Organization", entityId: params.organizationId, details: { ...params.reserve, ...(params.actor.via ? { via: params.actor.via } : {}) } });
}

export type ConfirmDeliveryResult = { status: "confirmed"; id: string } | { status: "already"; arrivedAt: Date } | { status: "notFound" };

/**
 * Bestätigt, dass eine bestellte Lieferung im Keller angekommen ist — erst ab dann zählt sie
 * zum Bestand. Optional mit den tatsächlich gelieferten Mengen (Teillieferung).
 */
export async function confirmLaundryDelivery(params: {
  organizationId: string;
  id: string;
  arrivedAt?: Date;
  quantities?: LaundryQuantity;
  actor: Actor;
}): Promise<ConfirmDeliveryResult> {
  const row = await prisma.laundryDelivery.findFirst({ where: { id: params.id, organizationId: params.organizationId, cancelled: false } });
  if (!row) return { status: "notFound" };
  if (row.arrivedAt) return { status: "already", arrivedAt: row.arrivedAt };
  const arrivedAt = params.arrivedAt ?? new Date();
  const r = await prisma.laundryDelivery.updateMany({
    where: { id: row.id, organizationId: params.organizationId, arrivedAt: null },
    data: { arrivedAt, ...(params.quantities ? { quantities: params.quantities as object } : {}) },
  });
  if (!r.count) return { status: "already", arrivedAt };
  await logAudit({
    organizationId: params.organizationId,
    userId: params.actor.userId,
    action: "laundry.delivery.arrived",
    entityType: "LaundryDelivery",
    entityId: row.id,
    details: { ...(params.quantities ?? {}), ...(params.actor.via ? { via: params.actor.via } : {}) },
  });
  return { status: "confirmed", id: row.id };
}
