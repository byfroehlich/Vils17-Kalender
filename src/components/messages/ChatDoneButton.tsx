"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

/** „Erledigt – keine Antwort nötig“: blendet den Chat aus, bis der Gast wieder schreibt. */
export function ChatDoneButton({ bookingId, messageId }: { bookingId: string; messageId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/chat-done`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Konnte nicht gespeichert werden.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={done}
        disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(20,184,166,0.45)", background: "rgba(20,184,166,0.15)", color: "#5eead4", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer" }}
      >
        <Check style={{ width: 14, height: 14 }} /> {busy ? "Speichert…" : "Erledigt – keine Antwort nötig"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#fca5a5" }}>{error}</span>}
    </span>
  );
}
