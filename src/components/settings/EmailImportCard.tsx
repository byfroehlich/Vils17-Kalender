"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";

interface ImportRow {
  id: string;
  portal: string | null;
  subject: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
  bookingId: string | null;
  parsedGuestCount: number | null;
}

const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  APPLIED:   { label: "Übernommen",     color: "#6ee7b7", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)" },
  NO_CHANGE: { label: "Keine Änderung", color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.14)" },
  UNMATCHED: { label: "Nicht zugeordnet", color: "#fcd34d", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)" },
  AMBIGUOUS: { label: "Mehrdeutig",     color: "#fcd34d", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)" },
  NO_DATA:   { label: "Nichts drin",    color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" },
  IGNORED:   { label: "Ignoriert",      color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)" },
  ERROR:     { label: "Fehler",         color: "#fca5a5", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.35)" },
};

export function EmailImportCard() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [konfiguriert, setKonfiguriert] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/email-import");
      if (!res.ok) return;
      const data = await res.json();
      setKonfiguriert(data.konfiguriert);
      setRows(data.imports ?? []);
    } catch {
      // Anzeige ist optional — Fehler hier nicht eskalieren
    }
  }

  useEffect(() => { load(); }, []);

  async function runNow() {
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/email-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Fehler beim Abrufen");
      } else {
        setMessage(
          `${data.gelesen} Mails gelesen · ${data.uebernommen} übernommen · ` +
          `${data.ohneZuordnung} ohne Zuordnung · ${data.ignoriert} ignoriert`
        );
        await load();
      }
    } catch {
      setMessage("Netzwerkfehler");
    } finally {
      setRunning(false);
      setTimeout(() => setMessage(""), 8000);
    }
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Mail style={{ width: 16, height: 16, color: "rgba(255,255,255,0.45)", marginTop: 2, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Portal-Mails auswerten</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, maxWidth: 460 }}>
              Ergänzt Gästezahl, Haustiere und Sonderwünsche aus den Bestätigungsmails
              von Booking.com und Airbnb — also die Angaben, die Smoobu nicht liefert.
            </p>
          </div>
        </div>
        <button
          onClick={runNow}
          disabled={running || konfiguriert === false}
          className="btn-secondary"
          style={{ padding: "8px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, opacity: konfiguriert === false ? 0.5 : 1 }}
        >
          <RefreshCw style={{ width: 13, height: 13, animation: running ? "spin 0.8s linear infinite" : "none" }} />
          {running ? "Wird geprüft…" : "Jetzt prüfen"}
        </button>
      </div>

      {konfiguriert === false && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 10 }}>
          <p style={{ fontSize: 13, color: "#fcd34d" }}>
            Postfach noch nicht eingerichtet. In Render nötig: <strong>IMAP_HOST</strong>, <strong>IMAP_USER</strong> und <strong>IMAP_PASS</strong>.
            Danach die Portalmails in dieses Postfach weiterleiten.
          </p>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.70)" }}>{message}</p>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {rows.map((row) => {
            const s = STATUS[row.status] ?? STATUS.IGNORED;
            return (
              <div key={row.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, flexShrink: 0, whiteSpace: "nowrap" as const }}>
                  {s.label}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {row.detail ?? row.subject ?? "—"}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 1 }}>
                    {row.portal ?? "unbekannt"} · {new Date(row.createdAt).toLocaleString("de-AT", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length === 0 && konfiguriert && (
        <p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          Noch keine Mails ausgewertet.
        </p>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
