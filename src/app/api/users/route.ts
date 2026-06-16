import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "CLEANER"]).default("CLEANER"),
  phone: z.string().optional(),
  notes: z.string().optional(),
  language: z.enum(["de", "en"]).default("de"),
  cleanerRate: z.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, phone: true,
      notes: true, language: true, active: true, role: true, isPrimary: true, cleanerRate: true, createdAt: true,
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten", issues: parsed.error.issues }, { status: 400 });
  }

  const { name, email, password, role, phone, notes, language, cleanerRate } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), organizationId: session.user.organizationId },
  });

  if (existing) {
    return NextResponse.json({ error: "E-Mail bereits vergeben" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      phone,
      notes,
      language,
      ...(cleanerRate !== undefined ? { cleanerRate } : {}),
    },
    select: {
      id: true, name: true, email: true, phone: true,
      notes: true, language: true, active: true, role: true, cleanerRate: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
