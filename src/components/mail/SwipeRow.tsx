"use client";

import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

// Wischen nach links wie in Apple Mail (Entscheidung Mathias 31.10.2026):
// kurz wischen → roter „Papierkorb“-Knopf bleibt stehen; weit wischen (> 45 % Breite) → sofort in den Papierkorb.
// Nur waagrechte Bewegungen zählen, senkrechtes Scrollen bleibt unverändert (Richtung wird am Anfang festgelegt).

const REVEAL = 88; // Breite des Knopfes in px
const FULL = 0.45; // Anteil der Breite für „sofort löschen“

export function SwipeRow({ children, onDelete, onTap, enabled = true, label = "Papierkorb" }: {
  children: ReactNode;
  onDelete: () => void;
  onTap: () => void;
  enabled?: boolean;
  label?: string;
}) {
  const [dx, setDx] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; dir: "h" | "v" | null } | null>(null);
  const moved = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (!enabled) return;
    const t = e.touches[0]!;
    start.current = { x: t.clientX, y: t.clientY, base: dx, dir: null };
    moved.current = false;
    setAnimate(false);
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0]!;
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.dir = Math.abs(mx) > Math.abs(my) ? "h" : "v";
    }
    if (s.dir !== "h") return;
    moved.current = true;
    setDx(Math.min(0, s.base + mx));
  }
  function remove() {
    const w = box.current?.offsetWidth ?? 400;
    setAnimate(true);
    setLeaving(true);
    setDx(-w);
    setTimeout(onDelete, 180);
  }
  function onTouchEnd() {
    const s = start.current;
    start.current = null;
    if (!s || s.dir !== "h") return;
    const w = box.current?.offsetWidth ?? 400;
    setAnimate(true);
    if (-dx > w * FULL) remove();
    else if (-dx > REVEAL / 2) setDx(-REVEAL);
    else setDx(0);
  }
  function click() {
    if (moved.current) { moved.current = false; return; }
    if (dx !== 0) { setAnimate(true); setDx(0); return; }
    onTap();
  }

  return (
    <div ref={box} style={{ position: "relative", overflow: "hidden", maxHeight: leaving ? 0 : 200, transition: leaving ? "max-height 180ms ease 120ms" : undefined }}>
      {enabled && dx < 0 && (
        <button type="button" aria-label={label} onClick={remove}
          style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: -dx, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#dc2626", color: "#fff", border: 0, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Trash2 style={{ width: 16, height: 16 }} /> {label}
        </button>
      )}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        onClick={click}
        style={{ position: "relative", transform: `translateX(${dx}px)`, transition: animate ? "transform 180ms ease" : undefined, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
