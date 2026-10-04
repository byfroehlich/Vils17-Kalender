"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Glocke in der Topbar: Push-Benachrichtigungen ein-/ausschalten.
 *
 * iPhone-Besonderheiten (iOS 16.4+):
 *  - Push gibt es nur in der über „Zum Home-Bildschirm" installierten App,
 *    nicht im Safari-Tab.
 *  - Die Erlaubnis muss unmittelbar im Tipp angefragt werden. Steht vorher ein
 *    `await`, lehnt iOS die Anfrage stillschweigend ab. Deshalb kommt
 *    `Notification.requestPermission()` hier als Allererstes.
 */
export function PushToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSubscribed(false);
      return;
    }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => setSubscribed(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.ok ? 3000 : 8000);
    return () => clearTimeout(t);
  }, [message]);

  async function enable() {
    // Kein Push möglich? Konkret sagen, woran es liegt.
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      setMessage({
        text: isIos() && !isStandalone()
          ? "Auf dem iPhone geht Push nur in der installierten App: unten auf Teilen → „Zum Home-Bildschirm“, dann V17 vom Home-Bildschirm öffnen und hier erneut tippen."
          : "Dieses Gerät oder dieser Browser unterstützt keine Push-Benachrichtigungen.",
      });
      return;
    }

    if (Notification.permission === "denied") {
      setMessage({
        text: isIos()
          ? "Benachrichtigungen sind blockiert. iPhone-Einstellungen → Mitteilungen → V17 → „Mitteilungen erlauben“ einschalten."
          : "Benachrichtigungen sind blockiert. In den Browser-Einstellungen für diese Seite erlauben.",
      });
      return;
    }

    // Allererstes await im Tipp — sonst verweigert iOS die Anfrage
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage({ text: "Ohne Erlaubnis keine Benachrichtigungen. Du kannst es jederzeit erneut versuchen." });
      return;
    }

    setLoading(true);
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) {
        setMessage({ text: "Push ist auf dem Server noch nicht eingerichtet (VAPID-Schlüssel fehlen)." });
        return;
      }
      const { key } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      const keys = sub.toJSON().keys as { p256dh: string; auth: string };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys }),
      });
      if (!res.ok) throw new Error("Anmeldung beim Server fehlgeschlagen");

      setSubscribed(true);
      setMessage({ text: "Benachrichtigungen sind aktiv. Tipp erneut auf die Glocke, um eine Testnachricht zu schicken.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Push konnte nicht aktiviert werden." });
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setMenuOpen(false);
    setLoading(true);
    try {
      // Anmeldung vorher erneut an den Server geben — falls die DB sie verloren hat
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setSubscribed(false);
        setMessage({ text: "Dieses Gerät ist nicht mehr angemeldet. Bitte die Glocke erneut einschalten." });
        return;
      }
      const keys = sub.toJSON().keys as { p256dh: string; auth: string };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys }),
      });

      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error("Test konnte nicht gesendet werden.");
      const r: { notConfigured: boolean; devices: number; sent: number; failed: number; removed: number } = await res.json();

      if (r.notConfigured) {
        setMessage({ text: "Push ist auf dem Server noch nicht eingerichtet (VAPID-Schlüssel fehlen in Render)." });
      } else if (r.sent > 0) {
        setMessage({
          ok: true,
          text: `Testnachricht verschickt${r.devices > 1 ? ` an ${r.sent} Geräte` : ""} — sie sollte in wenigen Sekunden erscheinen.` +
            (isIos() ? " Falls nicht: App kurz in den Hintergrund wischen." : ""),
        });
      } else if (r.removed > 0) {
        setSubscribed(false);
        setMessage({ text: "Die Anmeldung dieses Geräts war abgelaufen. Bitte die Glocke erneut einschalten." });
      } else {
        setMessage({ text: "Versand fehlgeschlagen. Bitte Glocke aus- und wieder einschalten und erneut testen." });
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Test konnte nicht gesendet werden." });
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setMenuOpen(false);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMessage({ text: "Benachrichtigungen sind aus.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Konnte nicht abgeschaltet werden." });
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (loading) return;
    setMessage(null);
    // Aktiv → Menü mit Test und Ausschalten (kein versehentliches Abschalten mehr)
    if (subscribed) {
      setMenuOpen((o) => !o);
      return;
    }
    // Kein await davor — enable() muss die Erlaubnis noch im Tipp anfragen
    void enable();
  }

  if (subscribed === null) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={toggle}
        disabled={loading}
        title={subscribed ? "Benachrichtigungen: testen oder ausschalten" : "Benachrichtigungen aktivieren"}
        aria-label={subscribed ? "Benachrichtigungen: testen oder ausschalten" : "Benachrichtigungen aktivieren"}
        aria-expanded={subscribed ? menuOpen : undefined}
        style={{
          background: "none",
          border: "none",
          cursor: loading ? "default" : "pointer",
          padding: "4px 6px",
          borderRadius: 8,
          color: subscribed ? "#14B8A6" : "rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          opacity: loading ? 0.5 : 1,
        }}
      >
        {subscribed
          ? <Bell style={{ width: 18, height: 18 }} />
          : <BellOff style={{ width: 18, height: 18 }} />
        }
      </button>
      {menuOpen && (
        <>
          {/* Tipp daneben schließt das Menü */}
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: -40,
              width: 230,
              background: "rgba(10,50,45,0.98)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 12,
              padding: 6,
              zIndex: 60,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            {[
              { label: "Testnachricht senden", onClick: sendTest, color: "#5eead4" },
              { label: "Benachrichtigungen ausschalten", onClick: disable, color: "rgba(255,255,255,0.65)" },
            ].map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => void item.onClick()}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  color: item.color,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
      {message && (
        <div
          role="status"
          onClick={() => setMessage(null)}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: -40,
            width: "min(280px, calc(100vw - 32px))",
            background: message.ok ? "rgba(6,78,59,0.97)" : "rgba(69,10,10,0.97)",
            border: `1px solid ${message.ok ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 12.5,
            lineHeight: 1.45,
            color: message.ok ? "#a7f3d0" : "#fecaca",
            zIndex: 60,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
