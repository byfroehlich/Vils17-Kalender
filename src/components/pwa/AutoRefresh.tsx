"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Solange die App sichtbar ist, alle 3 Minuten nachladen
const POLL_MS = 3 * 60 * 1000;
// Nach Rückkehr aus dem Hintergrund nur nachladen, wenn sie länger weg war
const RESUME_AFTER_MS = 30 * 1000;

/**
 * Hält die geöffnete App aktuell — ohne Knopfdruck.
 *
 * Installierte Web-Apps (vor allem auf dem iPhone) bleiben im Hintergrund
 * stehen und zeigen beim Zurückholen den alten Stand. Diese Komponente stößt
 * beim Öffnen, beim Zurückkehren und regelmäßig einen Smoobu-Sync an (der
 * Server synchronisiert nur, wenn nötig) und lädt danach die Seite neu.
 * `router.refresh()` lädt nur die Serverdaten neu — Eingaben und offene
 * Dialoge bleiben erhalten.
 */
export function AutoRefresh() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    /**
     * @param always  true = auch neu laden, wenn kein Smoobu-Sync nötig war —
     *                andere Nutzer können inzwischen etwas geändert haben
     *                (Reinigung erledigt, Absage, Zuweisung)
     */
    async function refresh(always: boolean) {
      if (busy.current) return;
      busy.current = true;
      let synced = false;
      try {
        const res = await fetch("/api/sync/auto", { method: "POST" });
        if (res.ok) synced = Boolean((await res.json()).synced);
      } catch {
        // offline o.ä. — dann eben nur die Seite neu laden
      } finally {
        busy.current = false;
      }
      if (always || synced) router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : Infinity;
      hiddenAt.current = null;
      if (away >= RESUME_AFTER_MS) refresh(true);
    }

    // Beim Öffnen: Seite ist frisch geladen — nur neu rendern, wenn Smoobu Neues hatte
    refresh(false);

    document.addEventListener("visibilitychange", onVisibility);
    // iOS meldet das Zurückholen einer installierten App teils nur über pageshow
    window.addEventListener("pageshow", onVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh(true);
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}
