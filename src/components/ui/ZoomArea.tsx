"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

// ─── Vergrößerbarer Bereich (Kalender) ────────────────────────────────────────
// Die App sperrt das Zoomen der ganzen Seite (Viewport, iOS-Rahmen). Hier lässt
// sich ein einzelner Bereich vergrößern: mit zwei Fingern auseinanderziehen oder
// mit −/+. Größer als die Bildschirmbreite → seitlich wischen. Die gewählte
// Größe merkt sich das Gerät (nur Bequemlichkeit, darf fehlen).

const STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5];
const MIN = STEPS[0];
const MAX = STEPS[STEPS.length - 1];
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

function load(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return v >= MIN && v <= MAX ? v : 1;
  } catch {
    return 1;
  }
}

function save(key: string, z: number) {
  try {
    localStorage.setItem(key, String(z));
  } catch {
    /* privater Modus o.ä. — dann eben ohne Merken */
  }
}

export function ZoomArea({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const pinch = useRef<{ dist: number; zoom: number; midX: number; contentX: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Breite des Bereichs in px: der Inhalt bekommt sie fest und wird dann
  // gezoomt — so wächst er in Safari und Chrome gleich über den Rand hinaus
  const [baseWidth, setBaseWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBaseWidth(el.clientWidth || null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setZoom(load(storageKey)), [storageKey]);

  // Nach einer Größenänderung die Stelle unter den Fingern / die Mitte halten
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && box.current) {
      box.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [zoom]);

  function apply(next: number, anchorX?: number) {
    const el = box.current;
    const z = clamp(Math.round(next * 100) / 100);
    if (el) {
      const x = anchorX ?? el.clientWidth / 2;
      const contentX = (el.scrollLeft + x) / zoomRef.current;
      pendingScroll.current = Math.max(0, contentX * z - x);
    }
    setZoom(z);
    save(storageKey, z);
  }

  // Zwei-Finger-Geste — eigene Listener, weil preventDefault passive:false braucht
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      pinch.current = {
        dist: dist(e.touches),
        zoom: zoomRef.current,
        midX,
        contentX: (el.scrollLeft + midX) / zoomRef.current,
      };
    };
    const onMove = (e: TouchEvent) => {
      const p = pinch.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault(); // nicht die Seite verschieben/zoomen
      const z = clamp(p.zoom * (dist(e.touches) / p.dist));
      pendingScroll.current = Math.max(0, p.contentX * z - p.midX);
      setZoom(z);
    };
    const onEnd = (e: TouchEvent) => {
      if (!pinch.current || e.touches.length >= 2) return;
      pinch.current = null;
      save(storageKey, zoomRef.current);
    };
    // Safari: eigene Seiten-Zoomgeste im Bereich unterdrücken
    const stop = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
    };
  }, [storageKey]);

  const stepDown = () => apply([...STEPS].reverse().find((s) => s < zoom - 0.01) ?? MIN);
  const stepUp = () => apply(STEPS.find((s) => s > zoom + 0.01) ?? MAX);

  const btn: React.CSSProperties = {
    width: 34, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", color: "rgba(255,255,255,0.80)", cursor: "pointer", borderRadius: 8,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.14)" }}>
          <button type="button" onClick={stepDown} disabled={zoom <= MIN} aria-label="Kalender verkleinern" style={{ ...btn, opacity: zoom <= MIN ? 0.35 : 1 }}>
            <Minus style={{ width: 15, height: 15 }} />
          </button>
          <button type="button" onClick={() => apply(1)} aria-label="Normale Größe"
            style={{ ...btn, width: 50, fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(zoom * 100)} %
          </button>
          <button type="button" onClick={stepUp} disabled={zoom >= MAX} aria-label="Kalender vergrößern" style={{ ...btn, opacity: zoom >= MAX ? 0.35 : 1 }}>
            <Plus style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
      <div ref={box} style={{ overflowX: zoom > 1 ? "auto" : "hidden", touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" }}>
        <div style={{ zoom, width: baseWidth ?? undefined }}>{children}</div>
      </div>
    </div>
  );
}
