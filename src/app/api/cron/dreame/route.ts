import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { runDreame } from "@/lib/dreame-runner";

// Saugroboter: starten (ab 10:00 am Abreisetag), überwachen, warnen.
// Beliebig oft aufrufbar (idempotent) — Cron alle 15 Minuten.

function secretOk(provided: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-cron-secret") ?? "")) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const result: Record<string, unknown> = {};
  for (const o of orgs) {
    try {
      result[o.id] = await runDreame({ organizationId: o.id });
    } catch (e) {
      result[o.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ ok: true, result });
}
