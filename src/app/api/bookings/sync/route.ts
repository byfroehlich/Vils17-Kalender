import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncBookings } from "@/lib/sync";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Cron-Job Authentifizierung (via Secret Header)
  const cronSecret = req.headers.get("x-cron-secret");
  let organizationId: string | null = null;
  let userId: string | undefined;

  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    // Cron-Job: alle Organizationen syncen
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    const results = await Promise.all(
      orgs.map((org) => syncBookings(org.id))
    );
    return NextResponse.json({ success: true, results });
  }

  // Manueller Sync via Admin
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  organizationId = session.user.organizationId;
  userId = session.user.id;

  try {
    const stats = await syncBookings(organizationId);

    await logAudit({
      organizationId,
      userId,
      action: "booking.sync",
      details: stats as unknown as Record<string, unknown>,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({ success: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[sync] Fehler:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
