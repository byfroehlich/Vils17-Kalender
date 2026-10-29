import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyToken, bearerFrom, generateToken, hashToken } from "@/lib/mcp/tokens";
import { checkRateLimit, resetRateLimit } from "@/lib/mcp/rate-limit";
import { resetDb, seedWorld, createToken } from "./fixtures";

describe("Token", () => {
  beforeEach(async () => { await resetDb(); });

  it("erzeugt Präfix v17_ und mindestens 32 Zufallsbytes, speichert nur den Hash", () => {
    const t = generateToken();
    expect(t.token.startsWith("v17_")).toBe(true);
    expect(Buffer.from(t.token.slice(4), "base64url").length).toBe(32);
    expect(t.hash).toBe(hashToken(t.token));
    expect(t.hash).not.toContain(t.token);
  });

  it("prüft gültige, unbekannte und widerrufene Token", async () => {
    const { org } = await seedWorld();
    const token = await createToken(org.id, ["bookings:read"], "Claude Desktop");
    const ok = await verifyToken(token);
    expect(ok).toMatchObject({ organizationId: org.id, tokenName: "Claude Desktop", scopes: ["bookings:read"] });

    expect(await verifyToken(token.slice(0, -1) + "x")).toBeNull();
    expect(await verifyToken("falsch")).toBeNull();

    await prisma.mcpToken.updateMany({ data: { revokedAt: new Date() } });
    expect(await verifyToken(token)).toBeNull();
  });

  it("setzt lastUsedAt", async () => {
    const { org } = await seedWorld();
    const token = await createToken(org.id, ["bookings:read"]);
    await verifyToken(token);
    const row = await prisma.mcpToken.findFirst();
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("liest den Bearer-Header", () => {
    expect(bearerFrom("Bearer v17_abc")).toBe("v17_abc");
    expect(bearerFrom("bearer  v17_abc ")).toBe("v17_abc");
    expect(bearerFrom("Basic xyz")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });
});

describe("Rate-Limit", () => {
  beforeEach(() => resetRateLimit());

  it("erlaubt 60 Aufrufe pro Minute, der 61. bekommt Retry-After", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(checkRateLimit("tok", t0 + i)).toBeNull();
    const wait = checkRateLimit("tok", t0 + 100);
    expect(wait).toBeGreaterThanOrEqual(59);
    expect(checkRateLimit("anderes-token", t0 + 100)).toBeNull();
    expect(checkRateLimit("tok", t0 + 60_001)).toBeNull();
  });
});
