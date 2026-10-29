import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/oauth/config";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { oauthJson, preflight } from "@/lib/oauth/http";

// /.well-known/oauth-authorization-server (RFC 8414)
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return oauthJson(authorizationServerMetadata(publicOrigin(req)), 200, { "Cache-Control": "public, max-age=3600" });
}

export const OPTIONS = preflight;
