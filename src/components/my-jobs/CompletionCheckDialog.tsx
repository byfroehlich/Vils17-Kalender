"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { ScrollLock } from "@/components/ui/ScrollLock";

// Pflicht-Check beim „Erledigt“ (Entscheidung Mathias 31.10.2026):
// 1. Ist alles heil (Möbel, Geräte, Geschirr …)?  2. Muss Verbrauchsmaterial nachgekauft werden?
// Meldungen gehen sofort per Push an Mathias und hängen am Aufenthalt davor.

const box = { background: "#0c3d38", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 24, width: "100%", maxWidth: 480, padding: 22, maxHeight: "100%", overflowY: "auto" as const };
const q = { fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)", margin: "14px 0 8px" } as const;

function Choice({ value, onChange, yes, no }: { value: boolean | null; onChange: (v: boolean) => void; yes: string; no: string }) {
  const b = (active: boolean, color: string) => ({
    flex: 1, padding: "11px 8px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? color : "rgba(255,255,255,0.2)"}`,
    background: active ? color : "rgba(255,255,255,0.08)", color: "white",
  });
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={() => onChange(true)} style={b(value === true, "#0D9488")}>{yes}</button>
      <button type="button" onClick={() => onChange(false)} style={b(value === false, "#d97706")}>{no}</button>
    </div>
  );
}

/** Bild verkleinern (max. 1600 px, JPEG) — spart Datenvolumen und Speicher */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CompletionCheckDialog({ bookingId, title, onCancel, onDone }: { bookingId: string; title: string; onCancel: () => void; onDone: () => void }) {
  const [inventoryOk, setInventoryOk] = useState<boolean | null>(null);
  const [damage, setDamage] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [suppliesOk, setSuppliesOk] = useState<boolean | null>(null);
  const [supplies, setSupplies] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = inventoryOk !== null && suppliesOk !== null && (inventoryOk || damage.trim()) && (suppliesOk || supplies.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/cleaning-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "COMPLETED",
        check: {
          inventoryOk, suppliesOk,
          ...(inventoryOk ? {} : { damage: damage.trim(), ...(photo ? { damagePhoto: photo } : {}) }),
          ...(suppliesOk ? {} : { supplies: supplies.trim() }),
        },
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError((j as { error?: string }).error ?? "Senden fehlgeschlagen — bitte nochmal.");
      return;
    }
    onDone();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: "16px 16px max(calc(env(safe-area-inset-bottom) + 72px), 80px) 16px" }}>
      <ScrollLock />
      <div style={box}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 2 }}>Reinigung abschließen</h3>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{title}</p>

        <div style={q}>Ist alles heil? (Möbel, Geräte, Geschirr, Deko …)</div>
        <Choice value={inventoryOk} onChange={setInventoryOk} yes="Alles in Ordnung" no="Etwas ist kaputt" />
        {inventoryOk === false && (
          <div style={{ marginTop: 10 }}>
            <textarea value={damage} onChange={(e) => setDamage(e.target.value)} rows={3} className="form-input" style={{ resize: "none" }}
              placeholder="Was ist kaputt oder fehlt? Wo?" />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "9px 12px", borderRadius: 12, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.2)", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              <Camera style={{ width: 16, height: 16 }} /> {photo ? "Anderes Foto" : "Foto machen"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f).catch(() => null)); e.target.value = ""; }} />
            </label>
            {photo && (
              <div style={{ position: "relative", marginTop: 8, display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Foto vom Schaden" style={{ maxHeight: 120, borderRadius: 10 }} />
                <button type="button" onClick={() => setPhoto(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: 0, borderRadius: 999, color: "white", padding: 2, cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button>
              </div>
            )}
          </div>
        )}

        <div style={q}>Muss etwas nachgekauft werden? (Reiniger, Lappen, Müllbeutel, Spülmittel …)</div>
        <Choice value={suppliesOk} onChange={setSuppliesOk} yes="Alles da" no="Etwas fehlt" />
        {suppliesOk === false && (
          <textarea value={supplies} onChange={(e) => setSupplies(e.target.value)} rows={2} className="form-input" style={{ resize: "none", marginTop: 10 }}
            placeholder="Was fehlt oder wird knapp?" />
        )}

        {error && <p style={{ color: "#fecaca", fontSize: 13, marginTop: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={submit} disabled={!ready || busy}
            style={{ flex: 1, padding: "12px 0", background: ready ? "#0D9488" : "rgba(13,148,136,0.4)", border: "none", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 15, cursor: ready ? "pointer" : "default" }}>
            {busy ? "Wird gesendet…" : "Erledigt melden"}
          </button>
          <button onClick={onCancel} className="btn-secondary" style={{ padding: "12px 18px" }}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
