"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check, ShieldOff, Plus, AlertTriangle, Link2 } from "lucide-react";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ConnectionRow {
  id: string;
  client: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: "16px 18px",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-AT", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className="btn-secondary"
      style={{ padding: "6px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {done ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
      {done ? "Kopiert" : label}
    </button>
  );
}

function ScopeChips({ scopes }: { scopes: string[] }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
      {scopes.map((s) => (
        <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.08)", color: s.endsWith(":write") ? "#fcd34d" : "#99f6e4" }}>
          {s}
        </span>
      ))}
    </div>
  );
}

export function McpTokenManager({
  initialTokens,
  connections,
  scopes,
}: {
  initialTokens: TokenRow[];
  connections: ConnectionRow[];
  scopes: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("Claude Desktop (Mac)");
  const [selected, setSelected] = useState<string[]>(["bookings:read", "cleaning:read", "finance:read"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  const endpoint = `${origin}/api/mcp`;

  async function create() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Anlegen fehlgeschlagen");
        return;
      }
      setCreated({ token: data.token, name: data.name });
      router.refresh();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(t: TokenRow) {
    if (!confirm(`Token „${t.name}" widerrufen? Claude kann sich damit sofort nicht mehr anmelden.`)) return;
    const res = await fetch(`/api/mcp-tokens/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widerrufen: true }),
    });
    if (res.ok) router.refresh();
    else alert("Widerrufen fehlgeschlagen");
  }

  async function disconnect(c: ConnectionRow) {
    if (!confirm(`Verbindung „${c.client}" trennen? Claude muss sich danach neu verbinden.`)) return;
    const res = await fetch(`/api/oauth-connections/${encodeURIComponent(c.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trennen: true }),
    });
    if (res.ok) router.refresh();
    else alert("Trennen fehlgeschlagen");
  }

  const desktopConfig = (token: string) =>
    JSON.stringify(
      {
        mcpServers: {
          "vils17-kalender": {
            command: "npx",
            args: ["-y", "mcp-remote", endpoint, "--header", "Authorization:${MCP_TOKEN}"],
            env: { MCP_TOKEN: `Bearer ${token}` },
          },
        },
      },
      null,
      2
    );

  return (
    <div className="space-y-4">
      {/* Endpunkt */}
      <div style={card}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Adresse</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <code style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", wordBreak: "break-all" }}>{endpoint}</code>
          {origin && <CopyButton text={endpoint} />}
        </div>
      </div>

      {/* claude.ai (OAuth) */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: 8 }}>
          <Link2 style={{ width: 15, height: 15 }} /> claude.ai (Handy, Web) — ohne Token
        </p>
        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 6, lineHeight: 1.55 }}>
          In claude.ai: Einstellungen → Connectoren → Eigenen Connector hinzufügen → Adresse oben einfügen → Verbinden.
          Danach hier anmelden und die Bereiche bestätigen. Nur das Admin-Konto kann zustimmen.
        </p>
        <div className="space-y-2" style={{ marginTop: 12 }}>
          {connections.length === 0 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Keine aktive Verbindung.</p>
          )}
          {connections.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{c.client}</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                  verbunden {fmt(c.createdAt)} · zuletzt benutzt {fmt(c.lastUsedAt)}
                </p>
                <ScopeChips scopes={c.scopes} />
              </div>
              <button type="button" onClick={() => disconnect(c)} className="btn-secondary" style={{ padding: "6px 10px", fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <ShieldOff style={{ width: 13, height: 13 }} /> Trennen
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Neu angelegt — Klartext genau einmal */}
      {created && (
        <div style={{ ...card, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.4)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle style={{ width: 16, height: 16, color: "#fcd34d", flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 13, color: "#fde68a" }}>
              Token „{created.name}" — <strong>nur jetzt sichtbar</strong>. Kopieren und sicher ablegen; danach ist es nicht mehr abrufbar.
            </p>
          </div>
          <code style={{ display: "block", marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.3)", fontSize: 12.5, color: "#fff", wordBreak: "break-all" }}>
            {created.token}
          </code>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <CopyButton text={created.token} label="Token kopieren" />
            <CopyButton text={desktopConfig(created.token)} label="Claude-Desktop-Konfiguration kopieren" />
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 10, lineHeight: 1.5 }}>
            Mac: Datei <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> öffnen, den Eintrag unter
            „mcpServers" einfügen, Claude Desktop neu starten.
          </p>
          <button type="button" onClick={() => setCreated(null)} className="btn-secondary" style={{ marginTop: 10, padding: "6px 12px", fontSize: 12 }}>
            Gesichert — ausblenden
          </button>
        </div>
      )}

      {/* Anlegen */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: 8 }}>
          <Plus style={{ width: 15, height: 15 }} /> Neues Token (Claude Desktop, Claude Code)
        </p>
        <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12, marginBottom: 6 }}>Name</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12, marginBottom: 6 }}>Bereiche</p>
        <div className="space-y-2">
          {scopes.map((s) => (
            <label key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "rgba(255,255,255,0.8)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) => setSelected((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                style={{ marginTop: 3 }}
              />
              <span>
                <code style={{ fontSize: 12, color: s.id.endsWith(":write") ? "#fcd34d" : "#5eead4" }}>{s.id}</code>
                <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 10 }}>{error}</p>}
        <button type="button" onClick={create} disabled={saving || selected.length === 0} className="btn-primary" style={{ marginTop: 14, padding: "10px 16px", fontSize: 14 }}>
          {saving ? "Wird angelegt…" : "Token anlegen"}
        </button>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {initialTokens.length === 0 && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Noch keine Token angelegt.</p>
        )}
        {initialTokens.map((t) => (
          <div key={t.id} style={{ ...card, opacity: t.revokedAt ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 8 }}>
                  <KeyRound style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {t.name}
                  {t.revokedAt && <span style={{ fontSize: 11, color: "#fca5a5" }}>widerrufen</span>}
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                  <code>{t.prefix}…</code> · angelegt {fmt(t.createdAt)} · zuletzt benutzt {fmt(t.lastUsedAt)}
                </p>
                <ScopeChips scopes={t.scopes} />
              </div>
              {!t.revokedAt && (
                <button type="button" onClick={() => revoke(t)} className="btn-secondary" style={{ padding: "6px 10px", fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <ShieldOff style={{ width: 13, height: 13 }} /> Widerrufen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
