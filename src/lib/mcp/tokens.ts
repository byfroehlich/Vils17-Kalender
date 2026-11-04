import { createHash, randomBytes } from "crypto";
import { prisma } from "../prisma";
import { sameResource } from "../oauth/resource";

// ─── Zugangstoken für die MCP-Schnittstelle ───────────────────────────────────
// Klartext nur beim Anlegen; in der DB liegt der SHA-256-Hash.

export const TOKEN_PREFIX = "v17_";

export const SCOPES = ["bookings:read", "cleaning:read", "cleaning:write", "finance:read", "messages:read", "messages:write"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  "bookings:read": "Buchungen, Belegung, An-/Abreisen lesen",
  "cleaning:read": "Reinigungen und Wäsche lesen",
  "cleaning:write": "Reinigungen zuweisen, Status, Wäschestatus, Notizen, Gästezahl, Sync auslösen",
  "finance:read": "Umsatz, Ortstaxe, Auszahlungen Reinigung lesen",
  "messages:read": "Gästenachrichten (Smoobu) und Postfach lesen",
  "messages:write": "Gästen antworten und Mails senden (nur nach Bestätigung)",
};

export function isScope(s: string): s is Scope {
  return (SCOPES as readonly string[]).includes(s);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Neues Token: Präfix + 32 Zufallsbytes (base64url). */
export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4) };
}

export interface McpAuth {
  tokenId: string;
  tokenName: string;
  organizationId: string;
  scopes: Scope[];
}

/**
 * Prüft ein Bearer-Token. Liefert null bei unbekanntem, widerrufenem oder
 * abgelaufenem Token. OAuth-Token (claude.ai) gelten zudem nur für die
 * Adresse, für die sie ausgestellt wurden (`resource`, RFC 8707).
 * Aktualisiert lastUsedAt höchstens einmal pro Minute (spart DB-Schreibzugriffe).
 */
export async function verifyToken(raw: string | null | undefined, resource?: string): Promise<McpAuth | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX) || raw.length < TOKEN_PREFIX.length + 40) return null;

  const row = await prisma.mcpToken.findUnique({
    where: { hash: hashToken(raw) },
    select: {
      id: true, name: true, organizationId: true, scopes: true, revokedAt: true, lastUsedAt: true,
      expiresAt: true, resource: true,
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (row.resource && (!resource || !sameResource(row.resource, resource))) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.mcpToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    tokenId: row.id,
    tokenName: row.name,
    organizationId: row.organizationId,
    scopes: row.scopes.filter(isScope),
  };
}

/** "Authorization: Bearer <token>" → Token */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}
