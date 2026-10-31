import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

// Test-Push an eine bestimmte Person (nur ADMIN), z. B. um zu prüfen, ob eine Reinigungskraft Push bekommt.
const bodySchema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  const user = await prisma.user.findFirst({
    where: { id: parsed.data.userId, organizationId: session.user.organizationId },
    select: { id: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
  const first = user.name.trim().split(" ")[0] ?? "";
  const result = await sendPushToUsers([user.id], {
    title: "🔔 Vils17 – Test-Benachrichtigung",
    body: `Hallo ${first}, das ist nur ein Test. Wenn du das siehst, kommen die Benachrichtigungen der Vils17-App bei dir an. Du musst nichts tun.`,
    url: "/",
  });
  return NextResponse.json(result);
}
