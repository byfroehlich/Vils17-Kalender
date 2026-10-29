import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/oauth/config";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { oauthJson, preflight } from "@/lib/oauth/http";

// /.well-known/oauth-protected-resource und …/api/mcp (RFC 9728)
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return oauthJson(protectedResourceMetadata(publicOrigin(req)), 200, { "Cache-Control": "public, max-age=3600" });
}

export const OPTIONS = preflight;
