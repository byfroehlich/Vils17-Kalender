"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

/** "vor 4 Min" — zeigt auf einen Blick, ob der automatische Sync läuft */
function formatAge(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "noch nie synchronisiert", stale: true };
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  // Cron läuft alle 15 Min — deutlich älter heißt: er läuft nicht
  const stale = min > 30;
  if (min < 1) return { text: "gerade aktualisiert", stale };
  if (min < 60) return { text: `vor ${min} Min aktualisiert`, stale };
  const h = Math.round(min / 60);
  if (h < 48) return { text: `vor ${h} Std aktualisiert`, stale };
  return { text: `vor ${Math.round(h / 24)} Tagen aktualisiert`, stale };
}

export function SyncButton({ lastSyncAt = null }: { lastSyncAt?: string | null }) {
  const age = formatAge(lastSyncAt);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setMessage("");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      const res = await fetch("/api/bookings/sync", {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setMessage(`Fehler ${res.status}`);
        return;
      }

      if (data.success) {
        const apart     = (data.apartmentsImported as number) ?? 0;
        const cancelled = (data.cancelled as number) ?? 0;
        const created   = (data.created as number) ?? 0;
        const parts: string[] = [];
        if (apart     > 0) parts.push(`${apart} importiert`);
        if (created   > 0) parts.push(`+${created} neu`);
        if (cancelled > 0) parts.push(`−${cancelled}`);
        setMessage(parts.length > 0 ? `✓ ${parts.join(", ")}` : "✓ Aktuell");
        router.refresh();
      } else {
        setMessage(`Fehler: ${(data.error as string) ?? "unbekannt"}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessage("Timeout");
      } else {
        setMessage("Netzwerkfehler");
      }
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(""), 5000);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {message ? (
        <span style={{ fontSize: 12, color: "#14B8A6", fontWeight: 600 }}>{message}</span>
      ) : (
        <span
          title={age.stale ? "Der automatische Sync scheint nicht zu laufen — Cron in Render prüfen" : "Automatischer Sync läuft"}
          style={{ fontSize: 11, color: age.stale ? "#fcd34d" : "rgba(255,255,255,0.45)" }}
        >
          {age.text}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(13,148,136,0.45)",
          borderRadius: 12,
          color: "#14B8A6",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.5 : 1,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          transition: "background 0.15s, border-color 0.15s",
          whiteSpace: "nowrap" as const,
        }}
      >
        <RefreshCw className={loading ? "animate-spin" : ""} style={{ width: 14, height: 14 }} />
        {loading ? "Sync..." : "Sync"}
      </button>
    </div>
  );
}
