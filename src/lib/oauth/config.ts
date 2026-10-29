import { SCOPES } from "../mcp/tokens";
export { sameResource } from "./resource";

// ─── OAuth 2.1 — Grundeinstellungen ───────────────────────────────────────────
// Die App ist zugleich MCP-Server (Ressource) und Autorisierungsserver.

export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 Stunde
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60; // 30 Tage, wird bei jeder Erneuerung getauscht
export const CODE_TTL_S = 5 * 60; // Autorisierungscode: 5 Minuten, einmalig
export const CONSENT_TTL_S = 10 * 60; // Zustimmungsseite: 10 Minuten gültig

/** Scopes für claude.ai — offline_access bewirkt ein Refresh-Token (Claude hängt ihn an, wenn angeboten). */
export const OAUTH_SCOPES = [...SCOPES] as string[];
export const AS_SCOPES = [...OAUTH_SCOPES, "offline_access"];

/**
 * Öffentliche Adresse der App, ohne Schrägstrich am Ende. NEXT_PUBLIC_APP_URL
 * hat Vorrang (die Crons nutzen sie ebenfalls), sonst die Header hinter dem Proxy.
 */
export function publicOrigin(source?: Request | Headers): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  if (source) {
    const h = source instanceof Headers ? source : source.headers;
    const host = h.get("x-forwarded-host")?.split(",")[0].trim() ?? h.get("host");
    const proto = h.get("x-forwarded-proto")?.split(",")[0].trim()
      ?? (source instanceof Headers ? "https" : new URL(source.url).protocol.replace(":", ""));
    if (host) return `${proto}://${host}`;
    if (!(source instanceof Headers)) return new URL(source.url).origin;
  }
  return "http://localhost:3000";
}

/** Kanonische Adresse der MCP-Schnittstelle = Zielgruppe der Token (RFC 8707). */
export function resourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}

// ─── Rücksprung-Adressen ──────────────────────────────────────────────────────
// Private App eines einzelnen Eigentümers: nur Claudes eigene Rücksprung-
// adressen und Loopback (Claude Code, MCP Inspector). Zusätzliche Adressen über
// MCP_OAUTH_EXTRA_REDIRECTS (kommagetrennt).

export const CLAUDE_CALLBACKS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

function extraRedirects(): string[] {
  return (process.env.MCP_OAUTH_EXTRA_REDIRECTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function isLoopback(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

/** Darf diese Adresse überhaupt registriert werden? */
export function redirectUriAllowed(uri: string): boolean {
  if (CLAUDE_CALLBACKS.includes(uri) || extraRedirects().includes(uri)) return true;
  if (isLoopback(uri)) {
    const u = new URL(uri);
    return !u.hash;
  }
  return false;
}

/**
 * Passt eine angefragte Rücksprung-Adresse zu den registrierten? Exakt —
 * außer bei Loopback, dort wird der Port ignoriert (RFC 8252, Claude Code
 * nutzt wechselnde Ports).
 */
export function redirectMatches(registered: string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  if (!isLoopback(presented)) return false;
  const p = new URL(presented);
  return registered.some((r) => {
    if (!isLoopback(r)) return false;
    const q = new URL(r);
    const host = (h: string) => (h === "127.0.0.1" || h === "[::1]" ? "loopback-ip" : h);
    return (
      host(q.hostname) === host(p.hostname) &&
      q.pathname === p.pathname &&
      q.search === p.search
    );
  });
}

/** Hosts, deren Client-ID-Metadaten-Dokumente wir laden (SSRF-Schutz). */
export function cimdHosts(): string[] {
  return (process.env.MCP_OAUTH_CIMD_HOSTS ?? "claude.ai,claude.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export class OAuthError extends Error {
  constructor(public error: string, public description: string, public status = 400) {
    super(description);
  }
}
