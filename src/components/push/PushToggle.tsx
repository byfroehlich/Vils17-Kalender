"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

export function PushToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSubscribed(false);
      return;
    }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => setSubscribed(false));
  }, []);

  // Auto-hide error after 4s
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  async function toggle() {
    if (loading || !("serviceWorker" in navigator)) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setErrorMsg("Benachrichtigungen wurden im Browser blockiert");
          return;
        }

        const keyRes = await fetch("/api/push/vapid-public-key");
        if (!keyRes.ok) {
          setErrorMsg("Push nicht konfiguriert – VAPID Keys fehlen");
          return;
        }
        const { key } = await keyRes.json();

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        const json = sub.toJSON();
        const keys = json.keys as { p256dh: string; auth: string };
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, keys }),
        });
        setSubscribed(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Push konnte nicht aktiviert werden");
    } finally {
      setLoading(false);
    }
  }

  if (subscribed === null) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={toggle}
        disabled={loading}
        title={subscribed ? "Benachrichtigungen deaktivieren" : "Benachrichtigungen aktivieren"}
        style={{
          background: "none",
          border: "none",
          cursor: loading ? "default" : "pointer",
          padding: "4px 6px",
          borderRadius: 8,
          color: subscribed ? "#14B8A6" : "rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          opacity: loading ? 0.5 : 1,
        }}
      >
        {subscribed
          ? <Bell style={{ width: 18, height: 18 }} />
          : <BellOff style={{ width: 18, height: 18 }} />
        }
      </button>
      {errorMsg && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.35)",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          color: "#fca5a5",
          whiteSpace: "nowrap",
          zIndex: 50,
          pointerEvents: "none",
        }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}
