"use client";

import { useEffect, useState } from "react";
import { Download, Share, X, Plus } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "v17-install-hinweis-ausgeblendet";

/**
 * Hinweis zum Installieren auf dem Startbildschirm.
 *
 * Android/Chrome liefert `beforeinstallprompt` — daraus wird ein echter
 * Installieren-Knopf. iOS/Safari bietet keinen Dialog an; dort hilft nur die
 * Anleitung über „Teilen → Zum Home-Bildschirm". Läuft die App bereits
 * installiert, wird nichts angezeigt.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Bereits installiert? Dann nie anzeigen.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Privater Modus o.ä. — dann eben jedes Mal anzeigen
    }
    if (dismissed) return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    if (ios) {
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setVisible(false));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function hide() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // nicht kritisch
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.20)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <Download style={{ width: 17, height: 17, color: "#5eead4", flexShrink: 0, marginTop: 2 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>
          Als App installieren
        </p>

        {isIos ? (
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.60)", marginTop: 3, lineHeight: 1.5 }}>
            Unten auf{" "}
            <Share style={{ width: 12, height: 12, display: "inline", verticalAlign: -1 }} /> Teilen tippen,
            dann{" "}
            <Plus style={{ width: 12, height: 12, display: "inline", verticalAlign: -1 }} /> „Zum
            Home-Bildschirm". Danach startet V17 ohne Adressleiste.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.60)", marginTop: 3, lineHeight: 1.5 }}>
              Auf den Startbildschirm legen — startet dann ohne Adressleiste, wie eine normale App.
            </p>
            <button
              onClick={install}
              style={{
                marginTop: 9,
                padding: "8px 16px",
                borderRadius: 10,
                border: "none",
                background: "rgba(16,185,129,0.85)",
                color: "white",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Installieren
            </button>
          </>
        )}
      </div>

      <button
        onClick={hide}
        aria-label="Hinweis ausblenden"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.35)",
          padding: 2,
          flexShrink: 0,
        }}
      >
        <X style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );
}
