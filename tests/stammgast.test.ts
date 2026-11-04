import { describe, it, expect, beforeEach, vi } from "vitest";

const pushes = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock("@/lib/push", () => ({
  sendPushToRole: vi.fn(async (_o: string, _r: string[], p: { title: string; body: string }) => { pushes.push(p); }),
  sendPushToUsers: vi.fn(async () => ({})),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST, OPTIONS } from "@/app/api/public/stammgast/route";
import { GET as ABMELDEN } from "@/app/api/public/stammgast/abmelden/route";
import { resetSignupLimit, SIGNUP_LIMIT } from "@/lib/regular-guests";
import { runTool, type ToolContext } from "@/lib/mcp/tool";
import { findTool } from "@/lib/mcp/registry";
import { resetDb, seedWorld } from "./fixtures";

const CONSENT_MAIL = "Ich möchte Angebote per E-Mail erhalten.";
const CONSENT_WA = "Ich möchte Angebote per WhatsApp erhalten.";

let world: Awaited<ReturnType<typeof seedWorld>>;
let ip = 0;

function req(body: unknown, opts: { origin?: string | null; ip?: string } = {}) {
  const origin = opts.origin === undefined ? "https://vils17.at" : opts.origin;
  return new NextRequest("http://localhost/api/public/stammgast", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? `10.0.0.${++ip}`,
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: "Julia Sommer",
  email: "Julia.Sommer@example.org",
  phone: "+43 660 1234567",
  apartment: "penthouse",
  consentEmail: true,
  consentWhatsapp: false,
  consentText: CONSENT_MAIL,
  website: "",
};

beforeEach(async () => {
  resetSignupLimit();
  await resetDb();
  world = await seedWorld();
  pushes.length = 0;
});

describe("POST /api/public/stammgast", () => {
  it("Eintragung speichert Einwilligung mit Text und Zeitpunkt, Push ohne Namen, Audit ohne Kontaktdaten", async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://vils17.at");

    const rows = await prisma.regularGuest.findMany();
    expect(rows).toHaveLength(1);
    const g = rows[0]!;
    expect(g.organizationId).toBe(world.org.id);
    expect(g.email).toBe("julia.sommer@example.org");
    expect(g.apartment).toBe("penthouse");
    expect(g.consentEmail).toBe(true);
    expect(g.consentWhatsapp).toBe(false);
    expect(g.consentText).toBe(CONSENT_MAIL);
    expect(g.consentAt).toBeInstanceOf(Date);
    expect(g.unsubscribeToken.length).toBeGreaterThanOrEqual(16);
    expect(g.source).toBe("gaestemappe");

    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.title).toBe("⭐ Neuer Stammgast eingetragen");
    expect(JSON.stringify(pushes)).not.toMatch(/Julia|example\.org|660/);

    const audit = await prisma.auditLog.findMany({ where: { action: { startsWith: "regular_guest" } } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("regular_guest.signup");
    expect(JSON.stringify(audit[0]!.details)).not.toMatch(/Julia|example\.org|660/);
  });

  it("gleiche E-Mail aktualisiert statt doppelt, meldet sich erneut an, kein zweiter Push", async () => {
    await POST(req(valid));
    const first = await prisma.regularGuest.findFirstOrThrow();
    await prisma.regularGuest.update({ where: { id: first.id }, data: { unsubscribedAt: new Date() } });

    const res = await POST(req({ ...valid, email: "julia.sommer@EXAMPLE.org", consentWhatsapp: true, consentText: `${CONSENT_MAIL} ${CONSENT_WA}` }));
    expect(res.status).toBe(200);
    const rows = await prisma.regularGuest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.consentWhatsapp).toBe(true);
    expect(rows[0]!.consentText).toContain(CONSENT_WA);
    expect(rows[0]!.unsubscribedAt).toBeNull();
    expect(rows[0]!.unsubscribeToken).toBe(first.unsubscribeToken);
    expect(pushes).toHaveLength(1);
  });

  it("ohne Einwilligung → 400, nichts gespeichert", async () => {
    const res = await POST(req({ ...valid, consentEmail: false, consentWhatsapp: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Einwilligung/);
    expect(await prisma.regularGuest.count()).toBe(0);
  });

  it("ungültige Angaben → 400", async () => {
    expect((await POST(req({ ...valid, email: "keine-mail" }))).status).toBe(400);
    expect((await POST(req({ ...valid, name: "J" }))).status).toBe(400);
    expect((await POST(req({ ...valid, consentText: "" }))).status).toBe(400);
    expect((await POST(req({ ...valid, apartment: "keller" }))).status).toBe(400);
    expect((await POST(req({ ...valid, phone: "", consentWhatsapp: true, consentEmail: false, consentText: CONSENT_WA }))).status).toBe(400);
    expect(await prisma.regularGuest.count()).toBe(0);
  });

  it("Telefon und Wohnung sind optional", async () => {
    const res = await POST(req({ ...valid, phone: "", apartment: "" }));
    expect(res.status).toBe(200);
    const g = await prisma.regularGuest.findFirstOrThrow();
    expect(g.phone).toBeNull();
    expect(g.apartment).toBeNull();
  });

  it("Honeypot ausgefüllt → 200, aber nichts gespeichert und kein Push", async () => {
    const res = await POST(req({ ...valid, website: "https://spam.example" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await prisma.regularGuest.count()).toBe(0);
    expect(pushes).toHaveLength(0);
  });

  it("CORS nur für vils17.at und www.vils17.at", async () => {
    const www = await POST(req({ ...valid, email: "a@example.org" }, { origin: "https://www.vils17.at" }));
    expect(www.headers.get("access-control-allow-origin")).toBe("https://www.vils17.at");

    const evil = await POST(req({ ...valid, email: "b@example.org" }, { origin: "https://evil.example" }));
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();

    const pre = await OPTIONS(new NextRequest("http://localhost/api/public/stammgast", {
      method: "OPTIONS", headers: { origin: "https://vils17.at", "access-control-request-method": "POST" },
    }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://vils17.at");
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");

    const preEvil = await OPTIONS(new NextRequest("http://localhost/api/public/stammgast", {
      method: "OPTIONS", headers: { origin: "https://evil.example" },
    }));
    expect(preEvil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("Begrenzung je IP → 429", async () => {
    for (let i = 0; i < SIGNUP_LIMIT; i++) {
      expect((await POST(req({ ...valid, email: `g${i}@example.org` }, { ip: "1.2.3.4" }))).status).toBe(200);
    }
    const res = await POST(req({ ...valid, email: "zuviel@example.org" }, { ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
    expect(await prisma.regularGuest.count()).toBe(SIGNUP_LIMIT);
  });
});

describe("Abmelden", () => {
  it("Link setzt unsubscribedAt und zeigt deutsche Bestätigung", async () => {
    await POST(req(valid));
    const g = await prisma.regularGuest.findFirstOrThrow();
    const res = await ABMELDEN(new NextRequest(`http://localhost/api/public/stammgast/abmelden?token=${g.unsubscribeToken}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Sie sind abgemeldet");
    const after = await prisma.regularGuest.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.unsubscribedAt).not.toBeNull();
  });

  it("unbekanntes Token → 404, nichts geändert", async () => {
    await POST(req(valid));
    const res = await ABMELDEN(new NextRequest("http://localhost/api/public/stammgast/abmelden?token=gibtesnichtgibtesnicht"));
    expect(res.status).toBe(404);
    expect((await prisma.regularGuest.findFirstOrThrow()).unsubscribedAt).toBeNull();
  });
});

describe("MCP stammgaeste", () => {
  it("listet aktive, abgemeldete nur auf Wunsch; braucht messages:read", async () => {
    await POST(req(valid));
    await POST(req({ ...valid, name: "Tom Weg", email: "tom@example.org", apartment: "lodge", consentWhatsapp: true }));
    const tom = await prisma.regularGuest.findFirstOrThrow({ where: { email: "tom@example.org" } });
    await ABMELDEN(new NextRequest(`http://localhost/api/public/stammgast/abmelden?token=${tom.unsubscribeToken}`));

    const tool = findTool("stammgaeste")!;
    expect(tool.scope).toBe("messages:read");
    const ctx: ToolContext = { organizationId: world.org.id, tokenId: "t", tokenName: "Claude", scopes: ["messages:read"] };

    const r = await runTool(tool, {}, ctx);
    expect(r.ok).toBe(true);
    const res = r.result as { aktiv_gesamt: number; eintraege: any[]; naechster_cursor: string | null };
    expect(res.aktiv_gesamt).toBe(1);
    expect(res.eintraege).toHaveLength(1);
    expect(res.eintraege[0]).toMatchObject({
      name: "Julia Sommer", email: "julia.sommer@example.org", telefon: "+43 660 1234567",
      wohnung: "Penthouse No. 17", einwilligung_email: true, einwilligung_whatsapp: false,
    });
    expect(res.eintraege[0].eingetragen_am).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.eintraege[0].abmelde_link).toContain("/api/public/stammgast/abmelden?token=");

    const all = (await runTool(tool, { abgemeldete: true }, ctx)).result as { eintraege: any[] };
    expect(all.eintraege).toHaveLength(2);
    const t = all.eintraege.find((e) => e.email === "tom@example.org");
    expect(t.abgemeldet_am).toBeTruthy();
    expect(t.abmelde_link).toBeUndefined();

    const paged = (await runTool(tool, { abgemeldete: true, limit: 1 }, ctx)).result as { eintraege: any[]; naechster_cursor: string | null };
    expect(paged.eintraege).toHaveLength(1);
    expect(paged.naechster_cursor).toBeTruthy();

    const denied = await runTool(tool, {}, { ...ctx, scopes: ["bookings:read"] });
    expect(denied.ok).toBe(false);
  });
});
