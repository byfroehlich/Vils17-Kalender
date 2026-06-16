"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function toggle() {
    if (loading || !("serviceWorker" in navigator)) return;
    setLoading(true);
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
        if (permission !== "granted") return;

        const keyRes = await fetch("/api/push/vapid-public-key");
        if (!keyRes.ok) return;
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
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }

  if (subscribed === null) return null;

  return (
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
  );
}
