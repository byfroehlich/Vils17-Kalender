import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../prisma";
import { cimdHosts, OAuthError, redirectUriAllowed } from "./config";

// ─── OAuth-Clients ────────────────────────────────────────────────────────────
// Zwei Wege, wie sich Claude vorstellt:
//  - Dynamic Client Registration (RFC 7591): POST /oauth/register → zufällige client_id
//  - Client-ID-Metadaten-Dokument (CIMD): client_id ist eine HTTPS-URL, unter der
//    der Client seine Angaben veröffentlicht. Geladen wird nur von erlaubten Hosts.
// Alle Clients sind öffentlich (kein Secret) und müssen PKCE nutzen.

export interface OAuthClientInfo {
  clientId: string;
  name: string;
  redirectUris: string[];
  kind: "dcr" | "cimd";
}

const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_TIMEOUT_MS = 5_000;
const CIMD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const metadataSchema = z
  .object({
    redirect_uris: z.array(z.string().max(500)).min(1).max(10),
    client_name: z.string().max(200).optional(),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
  })
  .passthrough();

function cleanName(name: string | undefined, fallback: string): string {
  // Steuerzeichen raus, kurz halten — der Name erscheint auf der Zustimmungsseite
  const n = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return n || fallback;
}

/** Prüft Client-Metadaten (DCR-Anfrage oder CIMD-Dokument). */
function validateMetadata(raw: unknown): { name?: string; redirectUris: string[] } {
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OAuthError("invalid_client_metadata", "redirect_uris fehlt oder ist ungültig");
  }
  const m = parsed.data;
  const bad = m.redirect_uris.filter((u) => !redirectUriAllowed(u));
  if (bad.length) {
    throw new OAuthError("invalid_redirect_uri", `Rücksprung-Adresse nicht erlaubt: ${bad[0]}`);
  }
  if (m.token_endpoint_auth_method && m.token_endpoint_auth_method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Nur öffentliche Clients (token_endpoint_auth_method \"none\")");
  }
  if (m.grant_types && m.grant_types.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Nur authorization_code und refresh_token");
  }
  if (m.response_types && m.response_types.some((r) => r !== "code")) {
    throw new OAuthError("invalid_client_metadata", "Nur response_type \"code\"");
  }
  return { name: m.client_name, redirectUris: m.redirect_uris };
}

/** Dynamic Client Registration. */
export async function registerClient(body: unknown) {
  const meta = validateMetadata(body);
  const clientId = "v17c_" + randomBytes(16).toString("base64url");
  const row = await prisma.oAuthClient.create({
    data: {
      clientId,
      kind: "dcr",
      name: cleanName(meta.name, "MCP-Client"),
      redirectUris: meta.redirectUris,
    },
  });
  return {
    client_id: row.clientId,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

/** Ist diese client_id eine URL, unter der wir ein Metadaten-Dokument laden dürfen? */
export function isCimdClientId(clientId: string): boolean {
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    !u.username && !u.password && !u.port && !u.hash &&
    u.pathname.length > 1 &&
    cimdHosts().includes(u.hostname.toLowerCase())
  );
}

/** Lädt ein Client-ID-Metadaten-Dokument — klein, schnell, ohne Weiterleitungen. */
async function fetchCimd(clientId: string): Promise<unknown> {
  const res = await fetch(clientId, {
    redirect: "error",
    signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (!res || !res.ok) throw new OAuthError("invalid_client", "Client-Metadaten nicht abrufbar");
  const text = await res.text();
  if (text.length > CIMD_MAX_BYTES) throw new OAuthError("invalid_client", "Client-Metadaten zu groß");
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new OAuthError("invalid_client", "Client-Metadaten sind kein JSON");
  }
  if ((doc as { client_id?: unknown })?.client_id !== clientId) {
    throw new OAuthError("invalid_client", "client_id im Dokument stimmt nicht mit der URL überein");
  }
  return doc;
}

/**
 * Client zu einer client_id — DCR aus der DB, CIMD aus dem Zwischenspeicher
 * (höchstens 24 h alt) oder frisch geladen. Unbekannt → OAuthError.
 */
export async function getClient(clientId: string | null | undefined): Promise<OAuthClientInfo> {
  if (!clientId || clientId.length > 500) throw new OAuthError("invalid_client", "client_id fehlt");

  const row = await prisma.oAuthClient.findUnique({ where: { clientId } });

  if (isCimdClientId(clientId)) {
    if (row && row.fetchedAt && Date.now() - row.fetchedAt.getTime() < CIMD_MAX_AGE_MS) {
      return { clientId, name: row.name ?? clientId, redirectUris: row.redirectUris, kind: "cimd" };
    }
    const meta = validateMetadata(await fetchCimd(clientId));
    const name = cleanName(meta.name, new URL(clientId).hostname);
    await prisma.oAuthClient.upsert({
      where: { clientId },
      create: { clientId, kind: "cimd", name, redirectUris: meta.redirectUris, fetchedAt: new Date() },
      update: { name, redirectUris: meta.redirectUris, fetchedAt: new Date() },
    });
    return { clientId, name, redirectUris: meta.redirectUris, kind: "cimd" };
  }

  if (!row || row.kind !== "dcr") throw new OAuthError("invalid_client", "Unbekannter Client");
  return { clientId, name: row.name ?? "MCP-Client", redirectUris: row.redirectUris, kind: "dcr" };
}

/**
 * Aufräumen: nie benutzte DCR-Registrierungen nach einem Tag, abgelaufene
 * Codes nach einem Tag. Hält die Tabellen klein, auch wenn jemand
 * massenhaft registriert.
 */
export async function pruneOAuth(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.oAuthClient.deleteMany({ where: { kind: "dcr", lastUsedAt: null, createdAt: { lt: dayAgo } } }),
    prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    prisma.oAuthRefreshToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
  ]);
}
