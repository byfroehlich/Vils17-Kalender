"use client";

import { useEffect } from "react";

/**
 * Setzt das Fenster auf dem iPhone zurück, wenn iOS es verschoben hat.
 *
 * Beim Öffnen der Tastatur schiebt iOS das ganze Fenster nach oben und setzt es
 * in installierten Web-Apps nach dem Schließen teils nicht zurück — Topbar und
 * Menü bleiben dann verrutscht. Im App-Rahmen (#app-scroll) scrollt das Fenster
 * nie; jede Verschiebung ist also ein Fehler und wird auf 0 zurückgesetzt.
 */
export function IosViewportFix() {
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!isIos) return;

    const isField = (el: Element | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

    const reset = () => {
      // Nur im App-Rahmen — auf Seiten mit normal scrollendem Fenster nichts tun
      if (!document.getElementById("app-scroll")) return;
      // Solange ein Eingabefeld aktiv ist, darf iOS verschieben (Tastatur offen)
      if (isField(document.activeElement)) return;
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };

    let timer: number | undefined;
    const settle = () => {
      window.clearTimeout(timer);
      // nach der Schließ-Animation der Tastatur
      timer = window.setTimeout(reset, 150);
    };

    document.addEventListener("focusout", settle);
    window.visualViewport?.addEventListener("resize", settle);
    window.addEventListener("scroll", settle, { passive: true });
    window.addEventListener("pageshow", settle);
    document.addEventListener("visibilitychange", settle);
    settle();

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusout", settle);
      window.visualViewport?.removeEventListener("resize", settle);
      window.removeEventListener("scroll", settle);
      window.removeEventListener("pageshow", settle);
      document.removeEventListener("visibilitychange", settle);
    };
  }, []);

  return null;
}
