import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";
import { logAudit } from "../audit";
import { generateToken, hashToken, isScope } from "../mcp/tokens";
import {
  ACCESS_TOKEN_TTL_S, CODE_TTL_S, CONSENT_TTL_S, REFRESH_TOKEN_TTL_S, OAuthError, OAUTH_SCOPES, sameResource,
} from "./config";
import type { OAuthClientInfo } from "./clients";

// ─── OAuth-Ablauf: Zustimmung → Code → Token → Erneuerung ─────────────────────
// Das Zugriffstoken ist ein ganz normales MCP-Token (v17_…, Hash in mcp_tokens),
// nur mit Ablaufzeit, Zielgruppe und Verbindungs-ID. Eine „Verbindung“
// (familyId) entsteht mit jeder Zustimmung; Trennen sperrt alle ihre Token.

const REFRESH_PREFIX = "v17r_";

/** Nur bekannte Scopes, ohne Doppelte; offline_access ist kein Datenbereich. */
export function parseScopes(scope: string | null | undefined): string[] {
  const list: string[] = (scope ?? "").split(/\s+/).filter((s) => isScope(s));
  return OAUTH_SCOPES.filter((s) => list.includes(s));
}

// ─── Signierte Zustimmungsanfrage ─────────────────────────────────────────────
// Die Zustimmungsseite gibt die geprüfte Anfrage signiert an das Formular
// weiter. So kann niemand Rücksprung-Adresse oder PKCE-Wert zwischen Anzeige
// und Bestätigung austauschen, und die Bestätigung gilt nur für diesen Nutzer.

export interface ConsentRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
  scopes: string[];
  userId: string;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET fehlt");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update("oauth-consent:" + data).digest("base64url");
}

export function signConsent(req: ConsentRequest, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ ...req, exp: now + CONSENT_TTL_S * 1000 })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyConsent(signed: string, now = Date.now()): ConsentRequest {
  const [data, sig] = signed.split(".");
  if (!data || !sig) throw new OAuthError("invalid_request", "Zustimmung ungültig");
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new OAuthError("invalid_request", "Zustimmung ungültig");
  }
  const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as ConsentRequest & { exp: number };
  if (payload.exp < now) throw new OAuthError("invalid_request", "Zustimmung abgelaufen — bitte in Claude neu verbinden");
  return payload;
}

// ─── Autorisierungscode ───────────────────────────────────────────────────────

export async function createCode(p: {
  client: OAuthClientInfo;
  organizationId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
}): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await prisma.oAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: p.client.clientId,
      organizationId: p.organizationId,
      userId: p.userId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: p.scopes,
      resource: p.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_S * 1000),
      familyId: randomBytes(12).toString("base64url"),
    },
  });
  return code;
}

function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const grantError = (msg: string) => new OAuthError("invalid_grant", msg);

/** Code gegen Token tauschen (grant_type=authorization_code). */
export async function exchangeCode(p: {
  code: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeVerifier: string | null;
  resource: string | null;
}): Promise<TokenResponse> {
  if (!p.code || !p.codeVerifier) throw new OAuthError("invalid_request", "code und code_verifier erforderlich");
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(p.codeVerifier)) {
    throw new OAuthError("invalid_request", "code_verifier ungültig");
  }

  const row = await prisma.oAuthCode.findUnique({ where: { codeHash: hashToken(p.code) } });
  if (!row) throw grantError("Code unbekannt");

  // Einmalig: nur wer usedAt von null auf jetzt setzt, bekommt Token
  const claimed = await prisma.oAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Wiederverwendeter Code → möglicherweise abgefangen: Verbindung sperren
    await revokeFamily(row.familyId, row.organizationId, "code_reuse");
    throw grantError("Code wurde bereits verwendet");
  }
  if (row.expiresAt.getTime() < Date.now()) throw grantError("Code abgelaufen");
  if (row.clientId !== p.clientId) throw grantError("Code gehört zu einem anderen Client");
  if (row.redirectUri !== p.redirectUri) throw grantError("redirect_uri stimmt nicht überein");
  if (pkceS256(p.codeVerifier) !== row.codeChallenge) throw grantError("PKCE-Prüfung fehlgeschlagen");
  if (p.resource && !sameResource(p.resource, row.resource)) {
    throw new OAuthError("invalid_target", "resource stimmt nicht mit der Autorisierung überein");
  }

  await assertStillAdmin(row.userId, row.organizationId);
  await prisma.oAuthClient.update({ where: { clientId: row.clientId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  const res = await issueTokens({
    organizationId: row.organizationId,
    userId: row.userId,
    clientId: row.clientId,
    familyId: row.familyId,
    scopes: row.scopes,
    resource: row.resource,
  });
  await logAudit({
    organizationId: row.organizationId,
    userId: row.userId,
    action: "oauth.connected",
    entityType: "OAuthConnection",
    entityId: row.familyId,
    details: { client: await clientLabel(row.clientId), scopes: row.scopes },
  });
  return res;
}

/** Refresh-Token tauschen (grant_type=refresh_token) — jedes Mal ein neues. */
export async function refreshTokens(p: {
  refreshToken: string | null;
  clientId: string | null;
  resource: string | null;
  scope: string | null;
}): Promise<TokenResponse> {
  if (!p.refreshToken) throw new OAuthError("invalid_request", "refresh_token erforderlich");
  const row = await prisma.oAuthRefreshToken.findUnique({ where: { hash: hashToken(p.refreshToken) } });
  if (!row || row.revokedAt) throw grantError("Refresh-Token ungültig");
  if (row.clientId !== p.clientId) throw grantError("Refresh-Token gehört zu einem anderen Client");

  const claimed = await prisma.oAuthRefreshToken.updateMany({
    where: { id: row.id, usedAt: null, revokedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Ein bereits getauschtes Token taucht wieder auf → gestohlen? Verbindung sperren
    await revokeFamily(row.familyId, row.organizationId, "refresh_reuse");
    throw grantError("Refresh-Token wurde bereits verwendet — Verbindung getrennt");
  }
  if (row.expiresAt.getTime() < Date.now()) throw grantError("Refresh-Token abgelaufen");
  if (p.resource && !sameResource(p.resource, row.resource)) {
    throw new OAuthError("invalid_target", "resource stimmt nicht überein");
  }

  // Scope darf nur eingeschränkt werden
  let scopes = row.scopes;
  if (p.scope) {
    const asked = parseScopes(p.scope);
    if (asked.some((s) => !row.scopes.includes(s))) throw new OAuthError("invalid_scope", "Mehr Rechte als erteilt");
    if (asked.length) scopes = asked;
  }

  await assertStillAdmin(row.userId, row.organizationId);

  return issueTokens({
    organizationId: row.organizationId,
    userId: row.userId,
    clientId: row.clientId,
    familyId: row.familyId,
    scopes,
    resource: row.resource,
  });
}

/** Wer zugestimmt hat, muss weiterhin aktiver Admin sein — sonst keine neuen Token. */
async function assertStillAdmin(userId: string, organizationId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, active: true, role: "ADMIN" },
    select: { id: true },
  });
  if (!user) throw grantError("Zustimmendes Konto ist kein aktiver Admin mehr");
}

async function clientLabel(clientId: string): Promise<string> {
  const c = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { name: true } });
  return c?.name ?? clientId;
}

async function issueTokens(p: {
  organizationId: string;
  userId: string;
  clientId: string;
  familyId: string;
  scopes: string[];
  resource: string;
}): Promise<TokenResponse> {
  const access = generateToken();
  const refresh = REFRESH_PREFIX + randomBytes(32).toString("base64url");
  const now = Date.now();
  const label = await clientLabel(p.clientId);

  await prisma.$transaction([
    prisma.mcpToken.create({
      data: {
        organizationId: p.organizationId,
        name: `OAuth · ${label}`.slice(0, 100),
        hash: access.hash,
        prefix: access.prefix,
        scopes: p.scopes,
        createdById: p.userId,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000),
        resource: p.resource,
        oauthFamilyId: p.familyId,
      },
    }),
    prisma.oAuthRefreshToken.create({
      data: {
        hash: hashToken(refresh),
        familyId: p.familyId,
        clientId: p.clientId,
        organizationId: p.organizationId,
        userId: p.userId,
        scopes: p.scopes,
        resource: p.resource,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000),
      },
    }),
  ]);

  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refresh,
    scope: p.scopes.join(" "),
  };
}

/** Verbindung trennen: alle Zugriffs- und Refresh-Token sperren. */
export async function revokeFamily(familyId: string, organizationId: string, reason: string, userId?: string) {
  const now = new Date();
  const [, access] = await prisma.$transaction([
    prisma.oAuthRefreshToken.updateMany({ where: { familyId, organizationId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.mcpToken.updateMany({ where: { oauthFamilyId: familyId, organizationId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await logAudit({
    organizationId,
    userId,
    action: "oauth.revoked",
    entityType: "OAuthConnection",
    entityId: familyId,
    details: { grund: reason, gesperrte_zugriffstoken: access.count },
  });
}

/**
 * Token-Widerruf (RFC 7009): Zugriffs- oder Refresh-Token → ganze Verbindung.
 * Unbekannte Token sind kein Fehler.
 */
export async function revokeByToken(token: string | null, clientId: string | null) {
  if (!token) return;
  const hash = hashToken(token);
  const refresh = await prisma.oAuthRefreshToken.findUnique({ where: { hash } });
  if (refresh) {
    if (refresh.clientId === clientId) await revokeFamily(refresh.familyId, refresh.organizationId, "client_revoke");
    return;
  }
  const access = await prisma.mcpToken.findUnique({ where: { hash } });
  if (access?.oauthFamilyId) {
    const owner = await prisma.oAuthRefreshToken.findFirst({ where: { familyId: access.oauthFamilyId }, select: { clientId: true } });
    if (owner?.clientId === clientId) await revokeFamily(access.oauthFamilyId, access.organizationId, "client_revoke");
  }
}

// ─── Verbindungen für die Einstellungen ───────────────────────────────────────

export interface OAuthConnection {
  id: string; // familyId
  client: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** Aktive Verbindungen = Familien mit einem gültigen, noch nicht getauschten Refresh-Token. */
export async function listConnections(organizationId: string): Promise<OAuthConnection[]> {
  const current = await prisma.oAuthRefreshToken.findMany({
    where: { organizationId, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
    select: { familyId: true, clientId: true, scopes: true },
  });
  if (!current.length) return [];
  const families = current.map((c) => c.familyId);
  const [usage, clients] = await Promise.all([
    prisma.mcpToken.groupBy({
      by: ["oauthFamilyId"],
      where: { organizationId, oauthFamilyId: { in: families } },
      _min: { createdAt: true },
      _max: { lastUsedAt: true },
    }),
    prisma.oAuthClient.findMany({
      where: { clientId: { in: current.map((c) => c.clientId) } },
      select: { clientId: true, name: true },
    }),
  ]);
  return current
    .map((c) => {
      const u = usage.find((x) => x.oauthFamilyId === c.familyId);
      return {
        id: c.familyId,
        client: clients.find((x) => x.clientId === c.clientId)?.name ?? c.clientId,
        scopes: c.scopes,
        createdAt: (u?._min.createdAt ?? new Date()).toISOString(),
        lastUsedAt: u?._max.lastUsedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
