import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClient } from "@/lib/oauth/clients";
import { OAuthError, OAUTH_SCOPES, publicOrigin, redirectMatches } from "@/lib/oauth/config";
import { redirectWith } from "@/lib/oauth/authorize";
import { createCode, verifyConsent } from "@/lib/oauth/flow";

// Formular der Zustimmungsseite. Die Anfrage kommt signiert und an den
// angemeldeten Admin gebunden; das Session-Cookie (SameSite=Lax) wird bei
// fremden Formular-POSTs nicht mitgeschickt, zusätzlich wird Origin geprüft.

export const dynamic = "force-dynamic";

function page(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Claude verbinden</title>` +
      `<body style="font-family:system-ui;padding:24px;max-width:480px;margin:auto"><h1 style="font-size:18px">Verbindung nicht möglich</h1>` +
      `<p>${message.replace(/[<>&"]/g, "")}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const origin = publicOrigin(req);
  const sentFrom = req.headers.get("origin");
  if (sentFrom && sentFrom !== origin && sentFrom !== new URL(req.url).origin) {
    return page("Ungültige Herkunft der Anfrage.", 403);
  }

  const session = await getServerSession(authOptions);
  if (!session) return page("Nicht angemeldet — bitte die Verbindung in Claude neu starten.", 401);
  if (session.user.role !== "ADMIN") return page("Nur das Admin-Konto kann Claude Zugriff geben.", 403);

  const form = await req.formData();
  let consent;
  try {
    consent = verifyConsent(String(form.get("consent") ?? ""));
  } catch (err) {
    return page(err instanceof OAuthError ? err.description : "Zustimmung ungültig");
  }
  if (consent.userId !== session.user.id) return page("Die Zustimmung gehört zu einem anderen Konto.", 403);

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(redirectWith(consent.redirectUri, { ...params, state: consent.state, iss: origin }), 303);

  const chosen = form.getAll("scope").map(String);
  const scopes = OAUTH_SCOPES.filter((s) => chosen.includes(s));
  const audit = { organizationId: session.user.organizationId, userId: session.user.id, entityType: "OAuthClient" };

  if (form.get("entscheidung") !== "zulassen" || scopes.length === 0) {
    await logAudit({ ...audit, action: "oauth.consent.denied", entityId: consent.clientId });
    return back({ error: "access_denied", error_description: "Zugriff abgelehnt" });
  }

  // Client und Rücksprung-Adresse nochmals prüfen (könnte inzwischen entfernt sein)
  let client;
  try {
    client = await getClient(consent.clientId);
  } catch {
    return page("Der Client ist nicht mehr registriert — bitte in Claude neu verbinden.");
  }
  if (!redirectMatches(client.redirectUris, consent.redirectUri)) return page("Rücksprung-Adresse nicht registriert.");

  const code = await createCode({
    client,
    organizationId: session.user.organizationId,
    userId: session.user.id,
    redirectUri: consent.redirectUri,
    codeChallenge: consent.codeChallenge,
    scopes,
    resource: consent.resource,
  });
  await logAudit({
    ...audit,
    action: "oauth.consent.granted",
    entityId: consent.clientId,
    details: { client: client.name, scopes, ruecksprung: new URL(consent.redirectUri).host },
  });
  return back({ code });
}
