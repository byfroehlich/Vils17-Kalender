import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const issue = await prisma.issue.findFirst({ where: { id: params.id, organizationId: session.user.organizationId }, select: { photo: true, photoType: true } });
  if (!issue?.photo || !issue.photoType) return NextResponse.json({ error: "Kein Foto" }, { status: 404 });
  return new NextResponse(new Uint8Array(issue.photo), {
    headers: { "Content-Type": issue.photoType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
