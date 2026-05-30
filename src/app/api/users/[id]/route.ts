import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const adminUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  language: z.enum(["de", "en"]).optional(),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "CLEANER"]).optional(),
  password: z.string().min(8).optional(),
  isPrimary: z.boolean().optional(),
});

const ownUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const isSelf = session.user.id === params.id;
  const isAdmin = session.user.role === "ADMIN";

  // Nur ADMIN darf andere User bearbeiten
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!user) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json();

  if (isSelf && !isAdmin) {
    // Eigenes Konto: nur Name, Telefon, Passwort ändern
    const parsed = ownUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
    }
    const { currentPassword, newPassword, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Aktuelles Passwort erforderlich" }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Aktuelles Passwort falsch" }, { status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    return NextResponse.json(updated);
  }

  // Admin: kann alles ändern
  const parsed = adminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const { password, isPrimary, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };

  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
  }

  if (isPrimary === true) {
    // Setzt diesen User als Hauptreiniger + weist alle offenen zukünftigen Jobs zu
    const now = new Date();
    await prisma.$transaction([
      // Alle anderen als nicht-primary markieren
      prisma.user.updateMany({
        where: { organizationId: session.user.organizationId, isPrimary: true },
        data: { isPrimary: false },
      }),
      // Alle offenen zukünftigen Aufträge zuweisen
      prisma.cleaningAssignment.updateMany({
        where: {
          organizationId: session.user.organizationId,
          status: "UNASSIGNED",
          booking: { checkOut: { gte: now }, status: "confirmed" },
        },
        data: {
          cleanerId: params.id,
          status: "ASSIGNED",
          assignedAt: now,
        },
      }),
    ]);
    updateData.isPrimary = true;
  } else if (isPrimary === false) {
    updateData.isPrimary = false;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true, name: true, email: true, phone: true,
      notes: true, language: true, active: true, role: true, isPrimary: true,
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

  // Eigenen Account nicht löschen
  if (session.user.id === params.id) {
    return NextResponse.json({ error: "Eigenen Account nicht löschbar" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
  });
  if (!user) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
