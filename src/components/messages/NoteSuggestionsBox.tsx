"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// „Hinweise für die Reinigung bestätigen“ (Seite /messages) — Vorschläge aus den Gästechats.
// Übernehmen hängt den (änderbaren) Text an den Hinweis an und benachrichtigt die Reinigungskraft.

export interface NoteSuggestionItem {
  id: string;
  proposedText: string;
  excerpt: string;
  extraBeds: number;
  bookingId: string;
  guestName: string;
  apartmentName: string;
  checkInLabel: string;
  currentNotes: string | null;
  currentExtraBeds: number;
  cleanerName: string | null;
}

const card = { padding: "12px 14px", borderRadius: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.30)" } as const;
const btn = { padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" } as const;

function Item({ s }: { s: NoteSuggestionItem }) {
  const router = useRouter();
  const [text, setText] = useState(s.proposedText);
  const [extraBeds, setExtraBeds] = useState(Math.max(s.extraBeds, s.currentExtraBeds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/note-suggestions/${s.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "accept" ? { action, text: text.trim(), extraBeds } : { action }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? "Speichern fehlgeschlagen");
      return;
    }
    router.refresh();
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
        {s.apartmentName} · Anreise {s.checkInLabel} · <Link href={`/bookings/${s.bookingId}`} style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline" }}>{s.guestName}</Link>
        {s.cleanerName && <> · Reinigung: {s.cleanerName}</>}
      </div>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", fontStyle: "italic", margin: "6px 0" }}>„{s.excerpt}“</p>
      {s.currentNotes && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6, whiteSpace: "pre-wrap" }}>Bisher: {s.currentNotes}</p>}
      <label style={{ fontSize: 12, fontWeight: 700, color: "#fcd34d" }}>⭐ Hinweis für die Reinigung</label>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className="form-input" style={{ marginTop: 4, fontSize: 14 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          Zusatzbetten{" "}
          <select value={extraBeds} onChange={(e) => setExtraBeds(Number(e.target.value))} className="form-input" style={{ width: 64, display: "inline-block", padding: "4px 8px", fontSize: 13 }}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        <button disabled={busy} onClick={() => decide("reject")} style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.18)" }}>Verwerfen</button>
        <button disabled={busy || !text.trim()} onClick={() => decide("accept")} style={{ ...btn, background: "rgba(245,158,11,0.85)", color: "white" }}>{busy ? "…" : "Übernehmen"}</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

export function NoteSuggestionsBox({ items }: { items: NoteSuggestionItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((s) => <Item key={s.id} s={s} />)}
    </div>
  );
}
