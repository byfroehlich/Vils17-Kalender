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
      const res = await fetch("/api/bookings/sync", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setMessage(`✓ Aktualisiert (+${data.created ?? 0} neu)`);
        router.refresh();
      } else {
        setMessage("Fehler beim Synchronisieren");
      }
    } catch {
      setMessage("Verbindungsfehler");
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(""), 4000);
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
