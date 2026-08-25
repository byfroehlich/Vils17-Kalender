import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runEmailImport } from "@/lib/email-import/run";
import { isImapConfigured } from "@/lib/email-import/imap";

export const maxDuration = 60;

/** Letzte Importe anzeigen (Admin) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const imports = await prisma.emailImport.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true, portal: true, subject: true, status: true, detail: true,
      createdAt: true, bookingId: true, parsedGuestCount: true,
    },
  });

  return NextResponse.json({ konfiguriert: isImapConfigured(), imports });
}

/** Import jetzt ausführen (Admin) */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  if (!isImapConfigured()) {
    return NextResponse.json(
      { error: "Postfach nicht konfiguriert — IMAP_HOST, IMAP_USER und IMAP_PASS in Render eintragen" },
      { status: 400 }
    );
  }

  try {
    const stats = await runEmailImport(session.user.organizationId);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[email-import]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
