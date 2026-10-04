"use client";

import { useEffect } from "react";

// Zähler statt Boolean: Mehrere offene Ebenen (z.B. Menü + Dialog) dürfen sich
// nicht gegenseitig entsperren.
let locks = 0;
let savedScrollY = 0;

function lock() {
  if (locks++ > 0) return;
  savedScrollY = window.scrollY;
  const s = document.body.style;
  // overflow:hidden allein reicht auf dem iPhone nicht — Safari scrollt den
  // Hintergrund trotzdem. Den Body festzunageln ist die verlässliche Variante.
  s.position = "fixed";
  s.top = `-${savedScrollY}px`;
  s.left = "0";
  s.right = "0";
  s.width = "100%";
}

function unlock() {
  if (locks === 0 || --locks > 0) return;
  const s = document.body.style;
  s.position = "";
  s.top = "";
  s.left = "";
  s.right = "";
  s.width = "";
  window.scrollTo(0, savedScrollY);
}

/**
 * Sperrt das Scrollen der Seite, solange diese Komponente eingehängt ist.
 * In jede Überlagerung (Menü, Dialog) als erstes Kind setzen:
 *
 *   {open && (<div style={{ position: "fixed", inset: 0 }}><ScrollLock /> …</div>)}
 *
 * Ohne Sperre scrollt auf dem iPhone der Hintergrund mit; zusammen mit
 * Nachfedern oder Tastatur bleibt die Ansicht dann verschoben hängen.
 */
export function ScrollLock() {
  useEffect(() => {
    lock();
    return unlock;
  }, []);
  return null;
}
