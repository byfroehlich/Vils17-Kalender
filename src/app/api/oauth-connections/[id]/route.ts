import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeFamily } from "@/lib/oauth/flow";

const schema = z.object({ trennen: z.literal(true) });

/** OAuth-Verbindung (z.B. claude.ai) trennen — sperrt alle Token dieser Verbindung. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!schema.safeParse(await req.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }
  const exists = await prisma.oAuthRefreshToken.findFirst({
    where: { familyId: params.id, organizationId: session.user.organizationId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Verbindung nicht gefunden" }, { status: 404 });

  await revokeFamily(params.id, session.user.organizationId, "admin", session.user.id);
  return NextResponse.json({ ok: true });
}
