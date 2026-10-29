import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateToken, SCOPES } from "@/lib/mcp/tokens";

const createSchema = z.object({
  name: z.string().trim().min(2, "Name zu kurz").max(60),
  scopes: z.array(z.enum(SCOPES)).min(1, "Mindestens einen Bereich auswählen"),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "ADMIN" ? session : null;
}

/** Token auflisten — nie Hash oder Klartext. */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const tokens = await prisma.mcpToken.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return NextResponse.json({ tokens });
}

/** Token anlegen — Klartext genau einmal in der Antwort. */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Daten" }, { status: 400 });
  }

  const t = generateToken();
  const row = await prisma.mcpToken.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      hash: t.hash,
      prefix: t.prefix,
      scopes: parsed.data.scopes,
      createdById: session.user.id,
    },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "mcp.token.created",
    entityType: "McpToken",
    entityId: row.id,
    details: { name: row.name, scopes: row.scopes },
  });

  return NextResponse.json({ token: t.token, ...row }, { status: 201 });
}
