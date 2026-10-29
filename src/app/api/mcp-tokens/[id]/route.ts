import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const schema = z.object({ widerrufen: z.literal(true) });

/** Token widerrufen. Gelöscht wird nie — Audit-Einträge verweisen darauf. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!schema.safeParse(await req.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const token = await prisma.mcpToken.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!token) return NextResponse.json({ error: "Token nicht gefunden" }, { status: 404 });
  if (token.revokedAt) return NextResponse.json({ ok: true, revokedAt: token.revokedAt });

  const updated = await prisma.mcpToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
    select: { revokedAt: true },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "mcp.token.revoked",
    entityType: "McpToken",
    entityId: token.id,
    details: { name: token.name },
  });

  return NextResponse.json({ ok: true, revokedAt: updated.revokedAt });
}
