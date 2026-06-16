"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushSubscriber() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    async function subscribe() {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        // Check existing subscription
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-send to server in case DB lost it
          const keys = existing.toJSON().keys as { p256dh: string; auth: string };
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: existing.endpoint, keys }),
          });
          return;
        }

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Get VAPID public key
        const keyRes = await fetch("/api/push/vapid-public-key");
        if (!keyRes.ok) return;
        const { key } = await keyRes.json();

        // Subscribe
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
      } catch {
        // Silently ignore — push is optional
      }
    }

    subscribe();
  }, []);

  return null;
}
