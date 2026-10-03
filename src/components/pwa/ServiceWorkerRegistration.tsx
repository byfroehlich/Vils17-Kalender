"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker für ALLE Seiten — auch für /login.
 *
 * Bewusst getrennt von PushSubscriber: Der Service Worker ist Voraussetzung
 * dafür, dass Android die App überhaupt zur Installation anbietet. Früher hing
 * die Registrierung an der Push-Logik und wurde übersprungen, sobald jemand
 * Benachrichtigungen abgelehnt hatte — dann war die App nicht installierbar.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registrierung ist optional — die App funktioniert auch ohne
      });
    };

    // Erst nach dem Laden registrieren, damit der erste Seitenaufbau nicht konkurriert
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
