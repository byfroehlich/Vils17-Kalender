"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncButton() {
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
        setMessage(`Serverfehler ${res.status}`);
        return;
      }

      if (data.success) {
        const apart = (data.apartmentsImported as number) ?? 0;
        const cancelled = (data.cancelled as number) ?? 0;
        const created = (data.created as number) ?? 0;
        const parts: string[] = [];
        if (apart > 0) parts.push(`${apart} Unterkunft(en) importiert`);
        if (created > 0) parts.push(`+${created} neu`);
        if (cancelled > 0) parts.push(`−${cancelled} storniert`);
        const msg = parts.length > 0 ? `✓ ${parts.join(", ")}` : "✓ Alles aktuell";
        setMessage(msg);
        router.refresh();
      } else {
        setMessage(`Fehler: ${(data.error as string) ?? "unbekannt"}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessage("Timeout – bitte nochmal versuchen");
      } else {
        setMessage(`Netzwerkfehler: ${err instanceof Error ? err.message : "unbekannt"}`);
      }
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(""), 6000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="text-base text-gray-600 font-medium">{message}</span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-gray-200 hover:border-blue-400 text-gray-700 hover:text-blue-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Synchronisiert..." : "Smoobu syncen"}
      </button>
    </div>
  );
}
