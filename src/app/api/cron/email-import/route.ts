import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runEmailImport } from "@/lib/email-import/run";
import { isImapConfigured } from "@/lib/email-import/imap";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  if (!isImapConfigured()) {
    return NextResponse.json({ skipped: true, reason: "IMAP nicht konfiguriert" });
  }

  // V1: genau eine Organization. Das Postfach gehört ihr.
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) {
    return NextResponse.json({ error: "Keine Organization gefunden" }, { status: 404 });
  }

  try {
    const stats = await runEmailImport(org.id);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[cron/email-import]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
