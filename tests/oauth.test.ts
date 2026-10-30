import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash, randomBytes } from "crypto";

process.env.NEXTAUTH_SECRET = "test-secret-für-oauth";

const session = vi.hoisted(() => ({ current: null as any }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetRateLimit } from "@/lib/mcp/rate-limit";
import { GET as prMeta } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { GET as asMeta } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route";
import { POST as register } from "@/app/oauth/register/route";
import { POST as approve } from "@/app/oauth/authorize/approve/route";
import { POST as token } from "@/app/oauth/token/route";
import { POST as revoke } from "@/app/oauth/revoke/route";
import { POST as mcp } from "@/app/api/mcp/route";
import { PATCH as disconnect } from "@/app/api/oauth-connections/[id]/route";
import { GET as listTokens } from "@/app/api/mcp-tokens/route";
import { checkAuthorizeRequest } from "@/lib/oauth/authorize";
import { getClient } from "@/lib/oauth/clients";
import { listConnections, signConsent, verifyConsent } from "@/lib/oauth/flow";
import { resetDb, seedWorld, createToken } from "./fixtures";

const ORIGIN = "http://localhost";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
let world: Awaited<ReturnType<typeof seedWorld>>;

const adminSession = () => ({
  user: { id: world.admin.id, role: "ADMIN", organizationId: world.org.id, name: "Mathias", email: "m@test.at" },
});

function form(url: string, params: Record<string, string | string[]>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) body.append(k, x);
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

function json(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function registerClient(redirect = CALLBACK) {
  const res = await register(json(`${ORIGIN}/oauth/register`, { client_name: "Claude", redirect_uris: [redirect] }));
  return { status: res.status, body: await res.json() };
}

/** Kompletter Ablauf bis zum Code. */
async function authorize(clientId: string, opts: { scopes?: string[]; redirect?: string; decision?: string } = {}) {
  const p = pkce();
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: opts.redirect ?? CALLBACK,
    code_challenge: p.challenge, code_challenge_method: "S256", state: "xyz",
    scope: "bookings:read cleaning:read finance:read cleaning:write offline_access",
    resource: `${ORIGIN}/api/mcp`,
  });
  const check = await checkAuthorizeRequest(q, ORIGIN);
  if (check.kind !== "ok") throw new Error(JSON.stringify(check));
  const r = check.request;
  const consent = signConsent({
    clientId: r.client.clientId, redirectUri: r.redirectUri, codeChallenge: r.codeChallenge,
    state: r.state, resource: r.resource, scopes: r.scopes, userId: world.admin.id,
  });
  const res = await approve(form(`${ORIGIN}/oauth/authorize/approve`, {
    consent, entscheidung: opts.decision ?? "zulassen", scope: opts.scopes ?? r.scopes,
  }, { origin: ORIGIN }));
  const location = new URL(res.headers.get("location")!);
  return { res, location, code: location.searchParams.get("code"), verifier: p.verifier };
}

async function exchange(clientId: string, code: string, verifier: string, redirect = CALLBACK) {
  const res = await token(form(`${ORIGIN}/oauth/token`, {
    grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId,
    redirect_uri: redirect, resource: `${ORIGIN}/api/mcp`,
  }));
  return { status: res.status, headers: res.headers, body: await res.json() };
}

async function refresh(clientId: string, refreshToken: string) {
  const res = await token(form(`${ORIGIN}/oauth/token`, {
    grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, resource: `${ORIGIN}/api/mcp`,
  }));
  return { status: res.status, body: await res.json() };
}

async function tools(accessToken: string) {
  const res = await mcp(new NextRequest(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }));
  return { status: res.status, headers: res.headers, body: res.status === 200 ? await res.json() : await res.json() };
}

beforeEach(async () => {
  resetRateLimit();
  await resetDb();
  world = await seedWorld();
  session.current = adminSession();
});

describe("Metadaten", () => {
  it("Protected Resource und Autorisierungsserver", async () => {
    const pr = await (await prMeta(new NextRequest(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json();
    expect(pr).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN] });

    const as = await (await asMeta(new NextRequest(`${ORIGIN}/.well-known/oauth-authorization-server`))).json();
    expect(as).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
    expect(as.scopes_supported).toContain("offline_access");
  });

  it("/api/mcp ohne Token verweist auf die Metadaten", async () => {
    const res = await mcp(new NextRequest(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    const h = res.headers.get("www-authenticate")!;
    expect(h).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(h).toContain('scope="bookings:read');
    expect(h).not.toContain("invalid_token");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("Registrierung", () => {
  it("nimmt Claudes Rücksprung-Adresse und Loopback an", async () => {
    const r = await registerClient();
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    expect(r.body.client_id).toMatch(/^v17c_/);
    expect(r.body.client_secret).toBeUndefined();
    expect((await registerClient("http://localhost:33418/callback")).status).toBe(201);
  });

  it("lehnt fremde Rücksprung-Adressen und vertrauliche Clients ab", async () => {
    const bad = await registerClient("https://evil.example/cb");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_redirect_uri");
    const conf = await register(json(`${ORIGIN}/oauth/register`, { redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_basic" }));
    expect(conf.status).toBe(400);
    expect((await register(json(`${ORIGIN}/oauth/register`, {}))).status).toBe(400);
  });

  it("begrenzt Registrierungen pro IP", async () => {
    for (let i = 0; i < 10; i++) expect((await registerClient()).status).toBe(201);
    const limited = await register(json(`${ORIGIN}/oauth/register`, { redirect_uris: [CALLBACK] }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("Autorisierungsanfrage", () => {
  it("unbekannter Client / falsche Rücksprung-Adresse → Fehlerseite, keine Weiterleitung", async () => {
    const q = (o: Record<string, string>) => new URLSearchParams({ response_type: "code", code_challenge_method: "S256", code_challenge: "a".repeat(43), ...o });
    expect((await checkAuthorizeRequest(q({ client_id: "gibts-nicht", redirect_uri: CALLBACK }), ORIGIN)).kind).toBe("page");
    const { body } = await registerClient();
    expect((await checkAuthorizeRequest(q({ client_id: body.client_id, redirect_uri: "https://evil.example/cb" }), ORIGIN)).kind).toBe("page");
  });

  it("ohne PKCE oder mit fremder Ressource → Fehler an den Client", async () => {
    const { body } = await registerClient();
    const noPkce = await checkAuthorizeRequest(new URLSearchParams({ response_type: "code", client_id: body.client_id, redirect_uri: CALLBACK, state: "s" }), ORIGIN);
    expect(noPkce.kind).toBe("redirect");
    const url = new URL((noPkce as { url: string }).url);
    expect(url.searchParams.get("error")).toBe("invalid_request");
    expect(url.searchParams.get("state")).toBe("s");

    const foreign = await checkAuthorizeRequest(new URLSearchParams({
      response_type: "code", client_id: body.client_id, redirect_uri: CALLBACK,
      code_challenge: "a".repeat(43), code_challenge_method: "S256", resource: "https://andere.example/api/mcp",
    }), ORIGIN);
    expect(new URL((foreign as { url: string }).url).searchParams.get("error")).toBe("invalid_target");
  });

  it("Loopback-Port darf wechseln (Claude Code)", async () => {
    const { body } = await registerClient("http://localhost:1111/callback");
    const q = new URLSearchParams({
      response_type: "code", client_id: body.client_id, redirect_uri: "http://localhost:2222/callback",
      code_challenge: "a".repeat(43), code_challenge_method: "S256",
    });
    const r = await checkAuthorizeRequest(q, ORIGIN);
    expect(r.kind).toBe("ok");
    expect((r as any).request.loopback).toBe(true);
  });
});

describe("Kompletter Ablauf", () => {
  it("Zustimmung → Code → Token → MCP → Erneuerung", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    expect(a.res.status).toBe(303);
    expect(a.location.origin + a.location.pathname).toBe(CALLBACK);
    expect(a.location.searchParams.get("state")).toBe("xyz");
    expect(a.location.searchParams.get("iss")).toBe(ORIGIN);

    const t = await exchange(client.client_id, a.code!, a.verifier);
    expect(t.status).toBe(200);
    expect(t.headers.get("cache-control")).toBe("no-store");
    expect(t.body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(t.body.access_token).toMatch(/^v17_/);
    expect(t.body.refresh_token).toMatch(/^v17r_/);
    expect(t.body.scope.split(" ").sort()).toEqual(["bookings:read", "cleaning:read", "cleaning:write", "finance:read"]);

    // Das Zugriffstoken ist ein normales MCP-Token (nur Hash in der DB)
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { oauthFamilyId: { not: null } } });
    expect(row.hash).not.toBe(t.body.access_token);
    expect(row.resource).toBe(`${ORIGIN}/api/mcp`);
    const list = await tools(t.body.access_token);
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toHaveLength(24);

    // Erneuern: neues Paar, altes Refresh-Token ist verbraucht
    const r1 = await refresh(client.client_id, t.body.refresh_token);
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(t.body.refresh_token);
    expect((await tools(r1.body.access_token)).status).toBe(200);

    // Audit: Zustimmung + Verbindung
    const actions = (await prisma.auditLog.findMany()).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["oauth.consent.granted", "oauth.connected"]));
    // Klartext-Token tauchen nirgends im Audit auf
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(t.body.access_token);
  });

  it("Admin kann Bereiche abwählen", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id, { scopes: ["bookings:read"] });
    const t = await exchange(client.client_id, a.code!, a.verifier);
    expect(t.body.scope).toBe("bookings:read");
    const names = (await tools(t.body.access_token)).body.result.tools.map((x: any) => x.name);
    expect(names).toContain("buchungen_list");
    expect(names).not.toContain("umsatz");
    expect(names).not.toContain("reinigung_zuweisen");
  });

  it("Ablehnen → access_denied, kein Code", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id, { decision: "ablehnen" });
    expect(a.location.searchParams.get("error")).toBe("access_denied");
    expect(a.code).toBeNull();
    expect(await prisma.oAuthCode.count()).toBe(0);
  });
});

describe("Angriffe und Fehler", () => {
  it("falscher PKCE-Verifier → invalid_grant", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, randomBytes(32).toString("base64url"));
    expect(t.status).toBe(400);
    expect(t.body.error).toBe("invalid_grant");
  });

  it("falsche redirect_uri oder fremder Client → invalid_grant", async () => {
    const { body: c1 } = await registerClient();
    const { body: c2 } = await registerClient();
    const a = await authorize(c1.client_id);
    expect((await exchange(c2.client_id, a.code!, a.verifier)).body.error).toBe("invalid_grant");
    const b = await authorize(c1.client_id);
    expect((await exchange(c1.client_id, b.code!, b.verifier, "https://claude.com/api/mcp/auth_callback")).body.error).toBe("invalid_grant");
  });

  it("Code doppelt eingelöst → Verbindung gesperrt", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    expect(t.status).toBe(200);
    const again = await exchange(client.client_id, a.code!, a.verifier);
    expect(again.body.error).toBe("invalid_grant");
    expect((await tools(t.body.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, t.body.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("altes Refresh-Token wiederverwendet → ganze Verbindung gesperrt", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    const r1 = await refresh(client.client_id, t.body.refresh_token);
    const reuse = await refresh(client.client_id, t.body.refresh_token);
    expect(reuse.body.error).toBe("invalid_grant");
    expect((await tools(r1.body.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, r1.body.refresh_token)).body.error).toBe("invalid_grant");
    expect(await prisma.auditLog.count({ where: { action: "oauth.revoked" } })).toBe(1);
  });

  it("abgelaufenes Token → 401 mit invalid_token", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    await prisma.mcpToken.updateMany({ where: { oauthFamilyId: { not: null } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await tools(t.body.access_token);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("Token für eine andere Adresse (Zielgruppe) wird abgelehnt", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    await prisma.mcpToken.updateMany({ where: { oauthFamilyId: { not: null } }, data: { resource: "https://andere.example/api/mcp" } });
    expect((await tools(t.body.access_token)).status).toBe(401);
  });

  it("manuelle Token (ohne resource) funktionieren weiter", async () => {
    const manual = await createToken(world.org.id, ["bookings:read"], "Desktop");
    expect((await tools(manual)).status).toBe(200);
  });

  it("nur ein Admin darf zustimmen", async () => {
    const { body: client } = await registerClient();
    const p = pkce();
    const consent = signConsent({
      clientId: client.client_id, redirectUri: CALLBACK, codeChallenge: p.challenge, state: null,
      resource: `${ORIGIN}/api/mcp`, scopes: ["bookings:read"], userId: world.vanessa.id,
    });
    session.current = { user: { id: world.vanessa.id, role: "CLEANER", organizationId: world.org.id } };
    const res = await approve(form(`${ORIGIN}/oauth/authorize/approve`, { consent, entscheidung: "zulassen", scope: "bookings:read" }));
    expect(res.status).toBe(403);
    expect(await prisma.oAuthCode.count()).toBe(0);

    session.current = null;
    expect((await approve(form(`${ORIGIN}/oauth/authorize/approve`, { consent, entscheidung: "zulassen" }))).status).toBe(401);
  });

  it("Zustimmung eines anderen Kontos, manipuliert oder fremde Herkunft → abgelehnt", async () => {
    const { body: client } = await registerClient();
    const base = {
      clientId: client.client_id, redirectUri: CALLBACK, codeChallenge: pkce().challenge, state: null,
      resource: `${ORIGIN}/api/mcp`, scopes: ["bookings:read"],
    };
    const other = signConsent({ ...base, userId: "jemand-anderes" });
    expect((await approve(form(`${ORIGIN}/oauth/authorize/approve`, { consent: other, entscheidung: "zulassen", scope: "bookings:read" }))).status).toBe(403);

    const mine = signConsent({ ...base, userId: world.admin.id });
    const [data, sig] = mine.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString()), redirectUri: "http://localhost:9/x" })).toString("base64url");
    expect((await approve(form(`${ORIGIN}/oauth/authorize/approve`, { consent: `${forged}.${sig}`, entscheidung: "zulassen", scope: "bookings:read" }))).status).toBe(400);

    expect((await approve(form(`${ORIGIN}/oauth/authorize/approve`, { consent: mine, entscheidung: "zulassen", scope: "bookings:read" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(await prisma.oAuthCode.count()).toBe(0);
  });

  it("Zustimmung läuft nach 10 Minuten ab", () => {
    const c = signConsent({ clientId: "c", redirectUri: CALLBACK, codeChallenge: "x", state: null, resource: "r", scopes: [], userId: "u" }, Date.now() - 11 * 60_000);
    expect(() => verifyConsent(c)).toThrow(/abgelaufen/);
  });

  it("Admin nicht mehr aktiv → keine Erneuerung", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    await prisma.user.update({ where: { id: world.admin.id }, data: { active: false } });
    expect((await refresh(client.client_id, t.body.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("unbekannter grant_type", async () => {
    const res = await token(form(`${ORIGIN}/oauth/token`, { grant_type: "password" }));
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});

describe("Trennen", () => {
  it("Einstellungen zeigen die Verbindung; Trennen sperrt alle Token", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    await refresh(client.client_id, t.body.refresh_token);

    const conns = await listConnections(world.org.id);
    expect(conns).toHaveLength(1);
    expect(conns[0].client).toBe("Claude");
    // OAuth-Zugriffstoken stehen nicht in der Token-Liste
    expect((await (await listTokens()).json()).tokens).toHaveLength(0);

    const res = await disconnect(json(`${ORIGIN}/api/oauth-connections/${conns[0].id}`, { trennen: true }) as any, { params: { id: conns[0].id } });
    expect(res.status).toBe(200);
    expect(await listConnections(world.org.id)).toHaveLength(0);
    expect(await prisma.mcpToken.count({ where: { oauthFamilyId: conns[0].id, revokedAt: null } })).toBe(0);
  });

  it("Widerruf durch den Client (RFC 7009)", async () => {
    const { body: client } = await registerClient();
    const a = await authorize(client.client_id);
    const t = await exchange(client.client_id, a.code!, a.verifier);
    const res = await revoke(form(`${ORIGIN}/oauth/revoke`, { token: t.body.refresh_token, client_id: client.client_id }));
    expect(res.status).toBe(200);
    expect((await tools(t.body.access_token)).status).toBe(401);
    // Unbekanntes Token ist kein Fehler
    expect((await revoke(form(`${ORIGIN}/oauth/revoke`, { token: "quatsch", client_id: "x" }))).status).toBe(200);
  });
});

describe("Client-ID-Metadaten-Dokument (CIMD)", () => {
  it("lädt nur von erlaubten Hosts, prüft client_id", async () => {
    const url = "https://claude.ai/oauth/mcp-client-metadata";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ client_id: url, client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }))
    );
    const c = await getClient(url);
    expect(c).toMatchObject({ kind: "cimd", name: "Claude", redirectUris: [CALLBACK] });
    // Zwischengespeichert: kein zweiter Abruf
    await getClient(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getClient("https://evil.example/client.json")).rejects.toThrow(/Unbekannter Client/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ client_id: "https://claude.ai/anders", redirect_uris: [CALLBACK] })));
    await expect(getClient("https://claude.ai/oauth/zweiter")).rejects.toThrow(/stimmt nicht/);
    fetchMock.mockRestore();
  });

  it("nimmt das echte claude.ai-Dokument an (zusätzlicher Grant-Typ jwt-bearer)", async () => {
    // Stand 30.10.2026, wörtlich von https://claude.ai/oauth/mcp-oauth-client-metadata
    const url = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    const doc = {
      client_id: url, client_name: "Claude", client_uri: "https://claude.ai",
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"],
      response_types: ["code"], token_endpoint_auth_method: "none",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(doc)));
    expect(await getClient(url)).toMatchObject({ kind: "cimd", name: "Claude", redirectUris: [CALLBACK] });
    fetchMock.mockRestore();
  });
});

describe("Registrierung: Grant-Typen", () => {
  it("ignoriert zusätzliche Grant-Typen, verlangt aber authorization_code", async () => {
    const extra = await register(json(`${ORIGIN}/oauth/register`, {
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"],
    }));
    expect(extra.status).toBe(201);
    expect((await extra.json()).grant_types).toEqual(["authorization_code", "refresh_token"]);

    const ohne = await register(json(`${ORIGIN}/oauth/register`, { redirect_uris: [CALLBACK], grant_types: ["client_credentials"] }));
    expect(ohne.status).toBe(400);
  });

  it("Token-Endpunkt lehnt fremde Grant-Typen weiter ab", async () => {
    const { body: client } = await registerClient();
    const res = await token(form(`${ORIGIN}/oauth/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", client_id: client.client_id, assertion: "x",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});
