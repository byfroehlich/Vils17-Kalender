import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { billingMonth } from "@/lib/billing-month";

const schema = z.object({
  cleanerId: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const { cleanerId, year, month } = parsed.data;
  const orgId = session.user.organizationId;

  // Abrechnungsmonat = Monat des Erledigens (lib/billing-month.ts), nicht mehr Abreisemonat
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const open = await prisma.cleaningAssignment.findMany({
    where: { organizationId: orgId, cleanerId, status: "COMPLETED", paidOut: false },
    select: { id: true, completedAt: true, booking: { select: { checkIn: true } } },
  });
  const ids = open.filter((x) => billingMonth(x) === key).map((x) => x.id);

  const now = new Date();
  const result = await prisma.cleaningAssignment.updateMany({
    where: { organizationId: orgId, id: { in: ids }, paidOut: false },
    data: { paidOut: true, paidOutAt: now },
  });

  return NextResponse.json({ updated: result.count });
}
