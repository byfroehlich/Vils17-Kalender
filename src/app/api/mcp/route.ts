import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerFrom, verifyToken } from "@/lib/mcp/tokens";
import { checkRateLimit } from "@/lib/mcp/rate-limit";
import { buildServer } from "@/lib/mcp/server";
import { OAUTH_SCOPES, publicOrigin, resourceMetadataUrl, resourceUrl } from "@/lib/oauth/config";

// MCP-Server (Streamable HTTP, zustandslos). Eigene Token-Prüfung — läuft
// bewusst NICHT über die next-auth-Middleware (siehe matcher in middleware.ts).
// Kein CORS: Aufrufe kommen von Claude Desktop (mcp-remote) bzw. claude.ai-Servern.
// Ohne gültiges Token: 401 mit Verweis auf die OAuth-Metadaten (RFC 9728) —
// daran erkennt claude.ai, wo es sich anmelden muss.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function error(message: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(req: NextRequest) {
  const origin = publicOrigin(req);
  const raw = bearerFrom(req.headers.get("authorization"));
  const auth = await verifyToken(raw, resourceUrl(origin));
  if (!auth) {
    const challenge = [
      `Bearer resource_metadata="${resourceMetadataUrl(origin)}"`,
      `scope="${OAUTH_SCOPES.join(" ")}"`,
      ...(raw ? ['error="invalid_token"', 'error_description="Token ungueltig, abgelaufen oder widerrufen"'] : []),
    ].join(", ");
    return error("Nicht autorisiert — gültiges Token im Header \"Authorization: Bearer v17_…\" erforderlich", 401, {
      "WWW-Authenticate": challenge,
    });
  }

  const wait = checkRateLimit(auth.tokenId);
  if (wait !== null) {
    return error(`Zu viele Anfragen — höchstens 60 pro Minute. Bitte in ${wait} s erneut versuchen.`, 429, {
      "Retry-After": String(wait),
    });
  }

  const server = buildServer({
    organizationId: auth.organizationId,
    tokenId: auth.tokenId,
    tokenName: auth.tokenName,
    scopes: auth.scopes,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // zustandslos
    enableJsonResponse: true,
  });
  await server.connect(transport);

  return transport.handleRequest(req, {
    authInfo: { token: auth.tokenId, clientId: auth.tokenName, scopes: auth.scopes },
  });
}

const notAllowed = () =>
  error("Nur POST wird unterstützt (zustandsloser MCP-Server ohne SSE-Stream)", 405, { Allow: "POST" });

export const GET = notAllowed;
export const DELETE = notAllowed;
