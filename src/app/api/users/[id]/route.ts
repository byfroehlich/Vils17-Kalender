import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  language: z.enum(["de", "en"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!user) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const { password, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };

  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true, name: true, email: true, phone: true,
      notes: true, language: true, active: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!user) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Assignments bleiben erhalten (cleaner wird auf null gesetzt via onDelete: SetNull)
  await prisma.user.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
