import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  active: z.boolean().optional(),
  laundryBedsDivisor: z.number().int().min(1).max(10).optional(),
  laundryTowelsPerGuest: z.number().int().min(0).max(10).optional(),
  laundryKitchenCount: z.number().int().min(0).max(10).optional(),
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

  const updated = await prisma.apartment.update({
    where: { id: params.id },
    data: parsed.data,
  });

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
