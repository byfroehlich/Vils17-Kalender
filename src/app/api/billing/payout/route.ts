import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const now = new Date();
  const result = await prisma.cleaningAssignment.updateMany({
    where: {
      organizationId: orgId,
      cleanerId,
      status: "COMPLETED",
      paidOut: false,
      booking: { checkOut: { gte: start, lt: end } },
    },
    data: { paidOut: true, paidOutAt: now },
  });

  return NextResponse.json({ updated: result.count });
}
