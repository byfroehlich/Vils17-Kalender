// Service Worker — Push-Benachrichtigungen + Installierbarkeit (PWA)
//
// Wichtig: Diese App zeigt personenbezogene, nutzerabhängige Daten. Seiten und
// API-Antworten werden deshalb NIE zwischengespeichert — sonst könnte ein Gerät
// Inhalte eines anderen Kontos oder veraltete Buchungen anzeigen. Gecacht werden
// ausschließlich unveränderliche Build-Dateien und die Offline-Seite.

const VERSION = "v2";
const STATIC_CACHE = `v17-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API-Antworten enthalten Kontodaten — niemals zwischenspeichern
  if (url.pathname.startsWith("/api/")) return;

  // Build-Dateien von Next.js sind unveränderlich (Hash im Dateinamen)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Seitenaufrufe immer aus dem Netz; ohne Verbindung die Offline-Seite
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? new Response("Offline", { status: 503 }))
      )
    );
  }
});

// ─── Push ─────────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Vils17", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
