"use client";

import { useEffect } from "react";

/**
 * Hält eine bestehende Push-Anmeldung mit dem Server synchron.
 *
 * Fragt bewusst NICHT selbst nach der Erlaubnis: iOS ignoriert Anfragen, die
 * nicht direkt aus einem Tipp kommen, und andere Browser werten automatische
 * Anfragen als aufdringlich und sperren sie dauerhaft. Die Erlaubnis holt die
 * Glocke in der Topbar (PushToggle) — per Tipp.
 */
export function PushSubscriber() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!existing) return;
        // Erneut an den Server senden — falls die DB die Anmeldung verloren hat
        // oder das Gerät sie inzwischen erneuert hat
        const keys = existing.toJSON().keys as { p256dh: string; auth: string };
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint, keys }),
        });
      } catch {
        // Push ist optional
      }
    })();
  }, []);

  return null;
}
