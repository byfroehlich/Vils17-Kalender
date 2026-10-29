import { NextRequest } from "next/server";
import { OAuthError } from "@/lib/oauth/config";
import { exchangeCode, refreshTokens } from "@/lib/oauth/flow";
import { limitByIp, oauthErrorResponse, oauthJson, preflight, readParams } from "@/lib/oauth/http";

// Token-Endpunkt: authorization_code (mit PKCE) und refresh_token (rotierend).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = limitByIp(req, "token", 30);
  if (limited) return limited;
  try {
    const p = await readParams(req);
    const grant = p.get("grant_type");
    if (grant === "authorization_code") {
      return oauthJson(await exchangeCode({
        code: p.get("code"),
        clientId: p.get("client_id"),
        redirectUri: p.get("redirect_uri"),
        codeVerifier: p.get("code_verifier"),
        resource: p.get("resource"),
      }));
    }
    if (grant === "refresh_token") {
      return oauthJson(await refreshTokens({
        refreshToken: p.get("refresh_token"),
        clientId: p.get("client_id"),
        resource: p.get("resource"),
        scope: p.get("scope"),
      }));
    }
    throw new OAuthError("unsupported_grant_type", "Nur authorization_code und refresh_token");
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
