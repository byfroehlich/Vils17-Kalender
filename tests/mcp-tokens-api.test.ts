import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, string> } }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));

import { GET, POST } from "@/app/api/mcp-tokens/route";
import { PATCH } from "@/app/api/mcp-tokens/[id]/route";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/mcp/tokens";
import { resetDb, seedWorld } from "./fixtures";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/mcp-tokens", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

let world: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
  session.current = { user: { id: world.admin.id, role: "ADMIN", organizationId: world.org.id } };
});

describe("Token-Verwaltung", () => {
  it("legt ein Token an, zeigt den Klartext genau einmal und speichert nur den Hash", async () => {
    const res = await POST(req({ name: "Claude Desktop", scopes: ["bookings:read", "finance:read"] }));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.token).toMatch(/^v17_/);

    const row = await prisma.mcpToken.findFirstOrThrow();
    expect(row.hash).not.toBe(created.token);
    expect(JSON.stringify(row)).not.toContain(created.token);
    expect(await verifyToken(created.token)).toMatchObject({ scopes: ["bookings:read", "finance:read"] });

    const list = await (await GET()).json();
    expect(JSON.stringify(list)).not.toContain(created.token);
    expect(JSON.stringify(list)).not.toContain(row.hash);
    expect(list.tokens[0]).toMatchObject({ name: "Claude Desktop", prefix: created.token.slice(0, 8) });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "mcp.token.created" } });
    expect(JSON.stringify(audit.details)).not.toContain(created.token);
  });

  it("widerruft ein Token — danach ist es ungültig", async () => {
    const created = await (await POST(req({ name: "Alt", scopes: ["bookings:read"] }))).json();
    const res = await PATCH(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ widerrufen: true }) }), { params: { id: created.id } });
    expect(res.status).toBe(200);
    expect(await verifyToken(created.token)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "mcp.token.revoked" } })).toBe(1);
  });

  it("prüft Eingaben", async () => {
    expect((await POST(req({ name: "X", scopes: ["bookings:read"] }))).status).toBe(400);
    expect((await POST(req({ name: "Gut", scopes: [] }))).status).toBe(400);
    expect((await POST(req({ name: "Gut", scopes: ["admin:all"] }))).status).toBe(400);
  });

  it("nur Admins", async () => {
    session.current = { user: { id: world.vanessa.id, role: "CLEANER", organizationId: world.org.id } };
    expect((await POST(req({ name: "Hack", scopes: ["finance:read"] }))).status).toBe(401);
    expect((await GET()).status).toBe(401);
    session.current = { user: { id: world.admin.id, role: "MANAGER", organizationId: world.org.id } };
    expect((await GET()).status).toBe(401);
  });

  it("widerruft keine Token fremder Organisationen", async () => {
    const created = await (await POST(req({ name: "Meins", scopes: ["bookings:read"] }))).json();
    session.current = { user: { id: "x", role: "ADMIN", organizationId: "andere-org" } };
    const res = await PATCH(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ widerrufen: true }) }), { params: { id: created.id } });
    expect(res.status).toBe(404);
    expect(await verifyToken(created.token)).not.toBeNull();
  });
});
