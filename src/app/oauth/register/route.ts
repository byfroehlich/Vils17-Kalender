import { NextRequest } from "next/server";
import { pruneOAuth, registerClient } from "@/lib/oauth/clients";
import { limitByIp, oauthErrorResponse, oauthJson, preflight } from "@/lib/oauth/http";

// Dynamic Client Registration (RFC 7591). Nur öffentliche Clients mit
// Claudes Rücksprung-Adressen oder Loopback (siehe oauth/config.ts).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = limitByIp(req, "register", 10);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => null);
    const client = await registerClient(body);
    await pruneOAuth().catch(() => undefined);
    return oauthJson(client, 201);
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
