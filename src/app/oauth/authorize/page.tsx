import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { publicOrigin } from "@/lib/oauth/config";
import { checkAuthorizeRequest, redirectWith } from "@/lib/oauth/authorize";
import { signConsent } from "@/lib/oauth/flow";
import { SCOPES, SCOPE_LABELS } from "@/lib/mcp/tokens";

// Zustimmungsseite für claude.ai & Co. Nur ein Admin-Konto darf zustimmen.
// Ohne Anmeldung → Login, danach zurück hierher.

export const dynamic = "force-dynamic";
export const metadata = { title: "Claude verbinden · V17" };

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.16)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.28)",
  borderRadius: 24,
  padding: 28,
  boxShadow: "0 24px 48px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.20)",
  color: "rgba(255,255,255,0.9)",
};
const muted: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div aria-hidden style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: [
          "radial-gradient(ellipse 100% 70% at 10% 0%,  rgba(20,184,166,0.60) 0%, transparent 55%)",
          "radial-gradient(ellipse  85% 65% at 45% 90%, rgba(13,148,136,0.40) 0%, transparent 55%)",
          "linear-gradient(160deg, #0c3d38 0%, #1a6e63 40%, #104e48 100%)",
        ].join(", "),
      }} />
      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

function Message({ title, text, back }: { title: string; text: string; back?: string }) {
  return (
    <Frame>
      <div style={card}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>{title}</h1>
        <p style={muted}>{text}</p>
        {back && (
          <a href={back} className="btn-primary w-full py-3 mt-5" style={{ display: "block", textAlign: "center" }}>
            Zurück zu Claude
          </a>
        )}
      </div>
    </Frame>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string") q.set(k, v);

  const origin = publicOrigin(headers());
  const check = await checkAuthorizeRequest(q, origin);
  if (check.kind === "page") return <Message title="Verbindung nicht möglich" text={check.message} />;
  if (check.kind === "redirect") redirect(check.url);
  const r = check.request;

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${q.toString()}`)}`);

  const denied = redirectWith(r.redirectUri, {
    error: "access_denied", error_description: "Nur der Admin kann Zugriff erteilen", state: r.state, iss: origin,
  });
  if (session.user.role !== "ADMIN") {
    return (
      <Message
        title="Keine Berechtigung"
        text={`Angemeldet als ${session.user.name ?? session.user.email}. Zugriff für Claude kann nur das Admin-Konto erteilen.`}
        back={denied}
      />
    );
  }

  const consent = signConsent({
    clientId: r.client.clientId,
    redirectUri: r.redirectUri,
    codeChallenge: r.codeChallenge,
    state: r.state,
    resource: r.resource,
    scopes: r.scopes,
    userId: session.user.id,
  });
  const host = new URL(r.redirectUri).host;

  return (
    <Frame>
      <form method="POST" action="/oauth/authorize/approve" style={card}>
        <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Claude verbinden</h1>
        <p style={muted}>
          <strong style={{ color: "white" }}>{r.client.name}</strong> möchte auf den Vils17-Kalender zugreifen.
          Nach der Zustimmung geht es zurück zu <strong style={{ color: "white" }}>{host}</strong>.
        </p>

        {r.loopback && (
          <p style={{ ...muted, marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.4)", color: "#fde68a" }}>
            Achtung: Die Rücksprung-Adresse ist ein Programm auf einem Computer ({host}), z.B. Claude Code.
            Nur zustimmen, wenn du die Verbindung gerade selbst gestartet hast.
          </p>
        )}

        <fieldset style={{ marginTop: 18, border: 0, padding: 0 }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>Erlaubte Bereiche</legend>
          {SCOPES.map((s) => (
            <label key={s} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", fontSize: 14 }}>
              <input type="checkbox" name="scope" value={s} defaultChecked={r.scopes.includes(s)} style={{ marginTop: 3 }} />
              <span>
                {SCOPE_LABELS[s]}
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {s}{s === "cleaning:write" ? " · ändert nur nach ausdrücklicher Bestätigung" : ""}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <p style={{ ...muted, fontSize: 12, marginTop: 10 }}>
          Kein Löschen, keine Preis- oder Smoobu-Änderungen, keine Nachrichten an Gäste.
          Trennen jederzeit unter Einstellungen → Claude-Schnittstelle.
        </p>

        <input type="hidden" name="consent" value={consent} />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button type="submit" name="entscheidung" value="ablehnen" className="btn-secondary flex-1 py-3">Ablehnen</button>
          <button type="submit" name="entscheidung" value="zulassen" className="btn-primary flex-1 py-3">Zulassen</button>
        </div>
      </form>
    </Frame>
  );
}
