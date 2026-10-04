"use client";

import { useEffect } from "react";

/**
 * Behebt ein bekanntes WebKit-Problem installierter Web-Apps auf dem iPhone:
 * Nach dem Schließen der Tastatur bleibt die Ansicht manchmal verschoben —
 * Topbar und Menü sind nach oben gerutscht, und die Seite lässt sich nicht
 * mehr scrollen, bis man die App neu startet.
 *
 * Ein Scroll auf die aktuelle Position zwingt Safari, die Ansicht neu zu
 * berechnen. Kostet nichts und hat auf anderen Geräten keine Wirkung.
 */
export function IosViewportFix() {
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!isIos) return;

    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

    let timer: number | undefined;
    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Wechselt der Fokus nur zum nächsten Feld, bleibt die Tastatur offen
        if (isField(document.activeElement)) return;
        window.scrollTo(window.scrollX, window.scrollY);
      }, 120);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (isField(e.target)) settle();
    };

    document.addEventListener("focusout", onFocusOut);
    // Tastatur zu → sichtbare Höhe ändert sich
    window.visualViewport?.addEventListener("resize", settle);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", settle);
    };
  }, []);

  return null;
}
