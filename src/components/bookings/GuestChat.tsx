"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw } from "lucide-react";

interface Msg { id: string; von: "gast" | "gastgeber"; betreff: string | null; text: string }

const glass = {
  background: "rgba(255,255,255,0.15)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 20,
} as const;

/** Gästechat über Smoobu: lesen und antworten (mit Bestätigung vor dem Senden). */
export function GuestChat({ bookingId, cancelled }: { bookingId: string; cancelled?: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [info, setInfo] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat konnte nicht geladen werden");
      setMessages(data.messages);
      setWaiting(!!data.waiting);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  async function send() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Senden fehlgeschlagen");
      setText("");
      setConfirming(false);
      setInfo("✓ Nachricht gesendet");
      setTimeout(() => setInfo(""), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ ...glass, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircle style={{ width: 16, height: 16, color: "#14B8A6" }} />
          Gästechat
          {waiting && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fcd34d" }}>
              wartet auf Antwort
            </span>
          )}
        </h2>
        <button onClick={load} disabled={loading} title="Neu laden" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
          <RefreshCw style={{ width: 15, height: 15 }} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 10 }}>{error}</div>}
      {info && <div style={{ fontSize: 13, color: "#86efac", marginBottom: 10 }}>{info}</div>}

      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {messages === null && !error && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Lade Chat …</div>}
        {messages?.length === 0 && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Noch keine Nachrichten.</div>}
        {messages?.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.von === "gast" ? "flex-start" : "flex-end",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 14,
              fontSize: 13,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: m.von === "gast" ? "rgba(255,255,255,0.10)" : "rgba(13,148,136,0.28)",
              border: m.von === "gast" ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(13,148,136,0.45)",
              color: "rgba(255,255,255,0.88)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>{m.von === "gast" ? "Gast" : "Wir"}</div>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginBottom: 10 }}>
        Antworten, die direkt in der Airbnb- oder Booking-App geschrieben wurden, erscheinen hier nicht.
      </p>

      {!cancelled && (
        <>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setConfirming(false); }}
            placeholder="Antwort an den Gast …"
            rows={3}
            className="form-input"
            style={{ resize: "vertical", marginBottom: 10 }}
          />
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!text.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(13,148,136,0.3)", border: "1px solid rgba(13,148,136,0.5)", borderRadius: 12, color: "#5eead4", fontWeight: 600, fontSize: 13, cursor: text.trim() ? "pointer" : "not-allowed", opacity: text.trim() ? 1 : 0.5 }}
            >
              <Send style={{ width: 14, height: 14 }} /> Senden …
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 13, color: "#fcd34d" }}>Wirklich an den Gast senden? Gesendet ist gesendet.</span>
              <button onClick={send} disabled={sending} style={{ padding: "7px 14px", background: "rgba(34,197,94,0.25)", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 10, color: "#86efac", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {sending ? "Sende …" : "Ja, senden"}
              </button>
              <button onClick={() => setConfirming(false)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
                Abbrechen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
