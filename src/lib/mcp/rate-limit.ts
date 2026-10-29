// ─── Rate-Limit pro Token ─────────────────────────────────────────────────────
// Gleitendes Fenster im Speicher. Reicht für eine einzelne Render-Instanz;
// bei mehreren Instanzen gilt das Limit je Instanz.

const WINDOW_MS = 60_000;
export const MAX_CALLS_PER_MINUTE = 60;

const hits = new Map<string, number[]>();

/** Liefert null, wenn erlaubt — sonst die Wartezeit in Sekunden (Retry-After). */
export function checkRateLimit(key: string, now = Date.now(), max = MAX_CALLS_PER_MINUTE): number | null {
  // Abgelaufene Schlüssel (z.B. IP-Adressen der OAuth-Endpunkte) gelegentlich entfernen
  if (hits.size > 5_000) {
    hits.forEach((v, k) => { if (!v.length || now - v[v.length - 1] >= WINDOW_MS) hits.delete(k); });
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

export function resetRateLimit() {
  hits.clear();
}
