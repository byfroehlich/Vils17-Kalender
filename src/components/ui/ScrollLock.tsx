"use client";

import { useEffect } from "react";

// Zähler statt Boolean: Mehrere offene Ebenen (z.B. Menü + Dialog) dürfen sich
// nicht gegenseitig entsperren.
let locks = 0;
let previous = "";

function target(): HTMLElement {
  // Im App-Rahmen scrollt nur der Inhaltsbereich; außerhalb (z.B. Login) der Body
  return document.getElementById("app-scroll") ?? document.body;
}

function lock() {
  if (locks++ > 0) return;
  const el = target();
  previous = el.style.overflowY;
  // Bei einem Scroll-Bereich innerhalb der Seite hält overflow:hidden auch auf
  // dem iPhone — und die Position bleibt erhalten, ohne Sprung.
  el.style.overflowY = "hidden";
}

function unlock() {
  if (locks === 0 || --locks > 0) return;
  target().style.overflowY = previous;
}

/**
 * Sperrt das Scrollen des Inhalts, solange diese Komponente eingehängt ist.
 * In jede Überlagerung (Menü, Dialog) als erstes Kind setzen:
 *
 *   {open && (<div style={{ position: "fixed", inset: 0 }}><ScrollLock /> …</div>)}
 */
export function ScrollLock() {
  useEffect(() => {
    lock();
    return unlock;
  }, []);
  return null;
}
