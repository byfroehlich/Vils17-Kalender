"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { petFee, PET_FEE_LABEL, PET_FEE_PER_NIGHT, portalCollectsPetFee } from "@/lib/pets";

const glass = {
  background: "rgba(255,255,255,0.15)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 20,
} as const;

const btn = (color: string) => ({
  padding: "7px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer",
  background: `rgba(${color},0.18)`, border: `1px solid rgba(${color},0.4)`, color: "rgba(255,255,255,0.85)",
}) as const;

export interface DogFeeBooking {
  id: string;
  smoobuId?: number | null;
  channelName?: string | null;
  checkIn: Date;
  checkOut: Date;
  status?: string;
  petCount?: number | null;
  petSource?: string | null;
  petHint?: string | null;
  petFeeStatus?: string | null;
  petFeeAmount?: number | null;
}

const SOURCE: Record<string, string> = { manual: "von Hand eingetragen", notice: "aus der Portalnotiz", chat: "aus dem Gästechat" };

/** Hund & Hundegebühr: Stand, Chat prüfen, Anforderung vorbereiten und senden, bezahlt/erlassen. */
export function DogFeeCard({ booking }: { booking: DogFeeBooking }) {
  const router = useRouter();
  const fee = petFee({ ...booking, checkIn: new Date(booking.checkIn), checkOut: new Date(booking.checkOut) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function call(body: object) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/bookings/${booking.id}/pets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehlgeschlagen");
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehlgeschlagen");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    const d = await call({ action: "scan" });
    if (!d) return;
    setMsg(d.found ? (d.changed ? `✓ ${d.found.count} Hund(e) erkannt und eingetragen` : d.skippedManual ? "Hund erkannt — Hand-Eingabe bleibt unverändert" : "Hund erkannt — schon eingetragen") : "Kein Hund in Notiz oder Chat gefunden");
    router.refresh();
  }

  async function prepare() {
    const d = await call({ action: "draft" });
    if (d) { setDraft(d.text); setConfirming(false); }
  }

  async function send() {
    if (!draft) return;
    const d = await call({ action: "request", text: draft });
    if (d) { setDraft(null); setMsg("✓ Anforderung gesendet"); router.refresh(); }
  }

  async function setFee(status: "PAID" | "WAIVED" | "REQUESTED" | null) {
    const d = await call({ action: "fee", status });
    if (d) { setMsg("✓ Gespeichert"); router.refresh(); }
  }

  const portal = portalCollectsPetFee(booking.channelName);
  const canChat = !!booking.smoobuId && booking.status !== "cancelled";

  return (
    <div style={{ ...glass, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>🐕 Hund &amp; Hundegebühr</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: fee.state === "OFFEN" ? "rgba(245,158,11,0.2)" : fee.state === "BEZAHLT" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)", color: fee.state === "OFFEN" ? "#fcd34d" : fee.state === "BEZAHLT" ? "#86efac" : "rgba(255,255,255,0.6)" }}>
          {PET_FEE_LABEL[fee.state]}
        </span>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: 12 }}>
        {fee.dogs > 0 ? (
          <>
            {fee.dogs} {fee.dogs === 1 ? "Hund" : "Hunde"} × {fee.nights} {fee.nights === 1 ? "Nacht" : "Nächte"} × {PET_FEE_PER_NIGHT} € = <strong>{fee.amount} €</strong>
            {booking.petSource && <span style={{ color: "rgba(255,255,255,0.45)" }}> · {SOURCE[booking.petSource] ?? booking.petSource}</span>}
            {portal && <div style={{ color: "rgba(255,255,255,0.5)" }}>{booking.channelName} zieht die Gebühr selbst ein — nichts anzufordern.</div>}
          </>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Kein Hund eingetragen.</span>
        )}
        {booking.petHint && (
          <div style={{ marginTop: 6, fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.55)" }}>„{booking.petHint}“</div>
        )}
      </div>

      {err && <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 8 }}>{err}</div>}
      {msg && <div style={{ fontSize: 13, color: "#86efac", marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
        {!portal && canChat && (
          <button disabled={busy} onClick={scan} style={btn("255,255,255")}>Chat auf Hund prüfen</button>
        )}
        {fee.state === "OFFEN" && canChat && !draft && (
          <button disabled={busy} onClick={prepare} style={btn("245,158,11")}>Gebühr anfordern …</button>
        )}
        {(fee.state === "OFFEN" || fee.state === "ANGEFORDERT") && (
          <>
            <button disabled={busy} onClick={() => setFee("PAID")} style={btn("34,197,94")}>Bezahlt</button>
            <button disabled={busy} onClick={() => setFee("WAIVED")} style={btn("255,255,255")}>Erlassen</button>
          </>
        )}
        {fee.state === "OFFEN" && (
          <button disabled={busy} onClick={() => setFee("REQUESTED")} style={btn("255,255,255")} title="Wenn du die Gebühr außerhalb der App angefordert hast">
            Schon angefordert
          </button>
        )}
        {(fee.state === "ANGEFORDERT" || fee.state === "BEZAHLT" || fee.state === "ERLASSEN") && (
          <button disabled={busy} onClick={() => setFee(null)} style={btn("255,255,255")}>Zurücksetzen</button>
        )}
      </div>

      {draft !== null && (
        <div style={{ marginTop: 14 }}>
          <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setConfirming(false); }} rows={10} className="form-input" style={{ resize: "vertical", marginBottom: 10 }} />
          {draft.includes("[ZAHLUNGSWEG EINTRAGEN]") && (
            <div style={{ fontSize: 12, color: "#fcd34d", marginBottom: 8 }}>Bitte den Platzhalter durch den Zahlungsweg ersetzen (PayPal-Link oder Bankverbindung).</div>
          )}
          {!confirming ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy || draft.includes("[ZAHLUNGSWEG EINTRAGEN]")} onClick={() => setConfirming(true)} style={btn("13,148,136")}>Senden …</button>
              <button onClick={() => setDraft(null)} style={btn("255,255,255")}>Verwerfen</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
              <span style={{ fontSize: 13, color: "#fcd34d" }}>Wirklich an den Gast senden?</span>
              <button disabled={busy} onClick={send} style={btn("34,197,94")}>{busy ? "Sende …" : "Ja, senden"}</button>
              <button onClick={() => setConfirming(false)} style={btn("255,255,255")}>Abbrechen</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
