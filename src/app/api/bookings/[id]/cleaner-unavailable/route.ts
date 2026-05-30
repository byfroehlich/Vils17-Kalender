import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  unavailable: z.boolean(),
  note: z.string().max(300).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

  const assignment = await prisma.cleaningAssignment.findFirst({
    where: {
      bookingId: params.id,
      organizationId: session.user.organizationId,
      cleanerId: session.user.role === "CLEANER" ? session.user.id : undefined,
    },
  });

  if (!assignment) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const updated = await prisma.cleaningAssignment.update({
    where: { id: assignment.id },
    data: {
      cleanerUnavailable: parsed.data.unavailable,
      cleanerUnavailableNote: parsed.data.unavailable ? (parsed.data.note ?? null) : null,
      cleanerUnavailableAt: parsed.data.unavailable ? new Date() : null,
    },
  });

  return NextResponse.json({ success: true, assignment: updated });
}
