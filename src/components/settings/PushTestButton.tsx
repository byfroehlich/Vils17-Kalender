"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PushTestButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  async function send() {
    setState("busy");
    const res = await fetch("/api/push/test-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) setState(r.error ?? "Fehler");
    else if (r.notConfigured) setState("Push nicht eingerichtet");
    else if (!r.devices) setState("kein Gerät");
    else setState(r.sent ? "✓ gesendet" : "✗ nicht zugestellt");
    router.refresh();
  }
  return (
    <button
      onClick={send}
      disabled={state === "busy"}
      style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", marginLeft: 8 }}
    >
      {state === "idle" ? "Test senden" : state === "busy" ? "…" : state}
    </button>
  );
}
