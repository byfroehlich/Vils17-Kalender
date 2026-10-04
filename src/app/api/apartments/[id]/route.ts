import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  active: z.boolean().optional(),
  laundryBedsDivisor: z.number().int().min(1).max(10).optional(),
  laundryTowelsPerGuest: z.number().int().min(0).max(10).optional(),
  laundryKitchenCount: z.number().int().min(0).max(10).optional(),
  dreameEnabled: z.boolean().optional(),
  preferredCleanerId: z.string().nullable().optional(),
  // Sondersatz pro Reinigung (null = entfernen) und für wen er gilt
  cleaningRate: z.number().min(0).max(1000).nullable().optional(),
  cleaningRateCleanerId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const apt = await prisma.apartment.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!apt) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Wohnungszuweisung: nur aktive Reinigungskräfte derselben Organization
  if (parsed.data.preferredCleanerId) {
    const cleaner = await prisma.user.findFirst({
      where: {
        id: parsed.data.preferredCleanerId,
        organizationId: session.user.organizationId,
        role: "CLEANER",
        active: true,
      },
      select: { id: true },
    });
    if (!cleaner) {
      return NextResponse.json({ error: "Reinigungskraft nicht gefunden" }, { status: 400 });
    }
  }

  // Sondersatz: Reinigungskraft muss zur Organization gehören
  if (parsed.data.cleaningRateCleanerId) {
    const rateCleaner = await prisma.user.findFirst({
      where: {
        id: parsed.data.cleaningRateCleanerId,
        organizationId: session.user.organizationId,
        role: "CLEANER",
      },
      select: { id: true },
    });
    if (!rateCleaner) {
      return NextResponse.json({ error: "Reinigungskraft für Sondersatz nicht gefunden" }, { status: 400 });
    }
  }

  const { cleaningRate, cleaningRateCleanerId, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  // Sondersatz ändern: gilt NIE rückwirkend, sondern für Buchungen, die ab
  // jetzt eingehen. Bestehende Buchungen behalten ihren Vermerk.
  if (cleaningRate !== undefined || cleaningRateCleanerId !== undefined) {
    const nextRate = cleaningRate !== undefined ? cleaningRate : apt.cleaningRate;
    const nextCleaner = cleaningRateCleanerId !== undefined ? cleaningRateCleanerId : apt.cleaningRateCleanerId;

    if (nextRate == null || !nextCleaner) {
      data.cleaningRate = null;
      data.cleaningRateCleanerId = null;
      data.cleaningRateFrom = null;
    } else if (nextRate !== apt.cleaningRate || nextCleaner !== apt.cleaningRateCleanerId) {
      data.cleaningRate = nextRate;
      data.cleaningRateCleanerId = nextCleaner;
      data.cleaningRateFrom = new Date();
    }
  }

  const updated = await prisma.apartment.update({
    where: { id: params.id },
    data,
  });

  if ("cleaningRate" in data) {
    await logAudit({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "apartment.cleaningRate.changed",
      entityType: "Apartment",
      entityId: apt.id,
      details: {
        before: { rate: apt.cleaningRate, cleanerId: apt.cleaningRateCleanerId },
        after: { rate: data.cleaningRate, cleanerId: data.cleaningRateCleanerId },
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const apt = await prisma.apartment.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!apt) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Nur deaktivieren wenn Buchungen vorhanden, sonst löschen
  const bookingCount = await prisma.booking.count({ where: { apartmentId: params.id } });

  if (bookingCount > 0) {
    await prisma.apartment.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ deactivated: true });
  } else {
    await prisma.apartment.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  }
}
