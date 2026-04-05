import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderLaundry, calculateLaundryQuantity } from "@/lib/laundry";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const laundrySchema = z.object({
  action: z.enum(["order", "status"]),
  status: z.enum(["OPEN", "ORDERED", "AVAILABLE"]).optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = laundrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    include: { apartment: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 });
  }

  // Assignment sicherstellen
  let assignment = await prisma.cleaningAssignment.findUnique({
    where: { bookingId: params.id },
  });

  if (!assignment) {
    assignment = await prisma.cleaningAssignment.create({
      data: {
        organizationId: session.user.organizationId,
        bookingId: params.id,
      },
    });
  }

  if (parsed.data.action === "status" && parsed.data.status) {
    // Nur Status ändern
    const updated = await prisma.cleaningAssignment.update({
      where: { id: assignment.id },
      data: {
        laundryStatus: parsed.data.status,
        laundryNotes: parsed.data.notes ?? assignment.laundryNotes,
      },
    });

    return NextResponse.json({ success: true, assignment: updated });
  }

  if (parsed.data.action === "order") {
    // Wäsche bestellen
    const quantity = calculateLaundryQuantity(booking.guestCount);

    const result = await orderLaundry({
      bookingId: booking.id,
      apartmentName: booking.apartment.name,
      checkOut: booking.checkOut,
      quantity,
    });

    const updated = await prisma.cleaningAssignment.update({
      where: { id: assignment.id },
      data: {
        laundryStatus: result.success ? "ORDERED" : "OPEN",
        laundryOrderId: result.orderId ?? null,
        laundryOrderedAt: result.success ? new Date() : null,
        laundryOrderStatus: result.success ? "confirmed" : "error",
        laundryQuantity: quantity,
        laundryNotes: parsed.data.notes ?? assignment.laundryNotes,
      },
    });

    await logAudit({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "laundry.ordered",
      entityType: "CleaningAssignment",
      entityId: assignment.id,
      details: { quantity, result, bookingId: params.id },
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      orderId: result.orderId,
      assignment: updated,
    });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
