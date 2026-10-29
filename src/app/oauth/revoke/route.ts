import { NextRequest, NextResponse } from "next/server";
import { revokeByToken } from "@/lib/oauth/flow";
import { CORS, limitByIp, preflight, readParams } from "@/lib/oauth/http";

// Token-Widerruf (RFC 7009) — trennt die ganze Verbindung. Antwortet immer 200.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = limitByIp(req, "token", 30);
  if (limited) return limited;
  const p = await readParams(req);
  await revokeByToken(p.get("token"), p.get("client_id")).catch((err) => console.error("[OAuth] revoke", err));
  return new NextResponse(null, { status: 200, headers: CORS });
}

export const OPTIONS = preflight;
