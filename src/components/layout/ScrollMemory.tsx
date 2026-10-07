"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Scroll-Position je Seite — überlebt Seitenwechsel innerhalb der App
const positions = new Map<string, number>();

/**
 * Scroll-Verhalten für den Inhaltsbereich (#app-scroll).
 *
 * Seit nur noch der Inhaltsbereich scrollt (nicht das Fenster), übernimmt der
 * Browser das nicht mehr selbst:
 *  - neue Seite → oben beginnen
 *  - Zurück-Taste / Wischgeste → dort weitermachen, wo man war
 *
 * Die Position wird im Moment des Verlassens gemerkt (Antippen eines Links,
 * Zurück-Geste) — nicht laufend. Sonst würde das Kürzen der Position beim
 * Rendern einer kürzeren Zielseite die gemerkte Position überschreiben.
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const cameBack = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    const scroller = () => document.getElementById("app-scroll");

    const remember = () => {
      const el = scroller();
      if (el) positions.set(current.current, el.scrollTop);
    };

    // Link angetippt → Position der verlassenen Seite festhalten
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      remember();
      leaving.current = true;
    };

    // Zurück/Vor → feuert, bevor die neue Seite gerendert ist
    const onPop = () => {
      remember();
      leaving.current = true;
      cameBack.current = true;
    };

    // Laufend merken, aber nicht während eines Seitenwechsels
    const onScroll = () => {
      if (!leaving.current) remember();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    const el = scroller();
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      el?.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Seitenwechsel abgeschlossen: zurück → alte Position, sonst oben
  useEffect(() => {
    if (current.current === pathname) return;
    current.current = pathname;
    const el = document.getElementById("app-scroll");
    const target = cameBack.current ? positions.get(pathname) ?? 0 : 0;
    cameBack.current = false;
    if (!el) {
      leaving.current = false;
      return;
    }
    // Nachfassen, bis der neue Inhalt hoch genug ist — die Seite kann beim
    // Zurückgehen vom Server nachgeladen werden und wächst dann noch. Höchstens
    // 1,5 s, und sofort aufhören, sobald jemand selbst wischt.
    const deadline = performance.now() + 1500;
    let userTookOver = false;
    const stop = () => { userTookOver = true; };
    el.addEventListener("touchstart", stop, { once: true, passive: true });
    el.addEventListener("wheel", stop, { once: true, passive: true });
    const finish = () => {
      leaving.current = false;
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
    };
    const apply = () => {
      if (userTookOver) return finish();
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) > 2 && performance.now() < deadline) {
        requestAnimationFrame(apply);
        return;
      }
      finish();
    };
    requestAnimationFrame(apply);
  }, [pathname]);

  return null;
}
