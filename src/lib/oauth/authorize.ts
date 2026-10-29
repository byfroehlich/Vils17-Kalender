import { getClient, type OAuthClientInfo } from "./clients";
import { isLoopback, OAuthError, OAUTH_SCOPES, redirectMatches, resourceUrl, sameResource } from "./config";
import { parseScopes } from "./flow";

// ─── Prüfung der Autorisierungsanfrage (/oauth/authorize) ─────────────────────
// Solange client_id und redirect_uri nicht geprüft sind, wird nie
// weitergeleitet (sonst offene Weiterleitung) — Fehler erscheinen als Seite.

export interface AuthorizeRequest {
  client: OAuthClientInfo;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
  scopes: string[];
  loopback: boolean;
}

export type AuthorizeCheck =
  | { kind: "ok"; request: AuthorizeRequest }
  | { kind: "page"; message: string }
  | { kind: "redirect"; url: string };

export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

export async function checkAuthorizeRequest(q: URLSearchParams, origin: string): Promise<AuthorizeCheck> {
  let client: OAuthClientInfo;
  try {
    client = await getClient(q.get("client_id"));
  } catch (err) {
    return { kind: "page", message: err instanceof OAuthError ? err.description : "Client konnte nicht geprüft werden" };
  }

  const redirectUri = q.get("redirect_uri");
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
    return { kind: "page", message: "Die Rücksprung-Adresse ist für diesen Client nicht registriert." };
  }

  const state = q.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    url: redirectWith(redirectUri, { error, error_description: description, state, iss: origin }),
  });

  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Nur response_type=code");
  const codeChallenge = q.get("code_challenge");
  if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || q.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE mit S256 erforderlich");
  }

  const own = resourceUrl(origin);
  const resource = q.get("resource") ?? own;
  if (!sameResource(resource, own)) return fail("invalid_target", "Unbekannte Ressource");

  const scopes = parseScopes(q.get("scope"));
  return {
    kind: "ok",
    request: {
      client,
      redirectUri,
      codeChallenge,
      state,
      resource: own,
      scopes: scopes.length ? scopes : [...OAUTH_SCOPES],
      loopback: isLoopback(redirectUri),
    },
  };
}
