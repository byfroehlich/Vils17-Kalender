import { createHash, createHmac, randomUUID } from "crypto";

// ─── Smoobu HMAC-Authentifizierung ────────────────────────────────────────────
// Smoobu schaltet am 31.10.2026 den alten "Api-Key"-Header ab.
// Doku: https://docs.smoobu.com/#hmac-authentication
//
// Ist SMOOBU_API_SECRET nicht gesetzt, wird übergangsweise weiter der alte
// "Api-Key"-Header gesendet.

/** RFC 3986: encodeURIComponent lässt !'()* stehen — die müssen kodiert werden */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Query-Parameter alphabetisch sortiert (Schlüssel, dann Wert), RFC-3986-kodiert */
export function canonicalQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** ISO 8601 in UTC ohne Millisekunden, z.B. 2026-10-27T12:00:00Z */
function timestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Erzeugt die HMAC-Header für eine Anfrage. Exportiert für Tests. */
export function hmacHeaders(params: {
  method: string;
  url: URL;
  body?: string;
  apiKey: string;
  apiSecret: string;
  timestamp?: string;
  nonce?: string;
}): Record<string, string> {
  const ts = params.timestamp ?? timestamp();
  const nonce = params.nonce ?? randomUUID();
  const bodyHash = createHash("sha256").update(params.body ?? "").digest("hex");

  const canonical = [
    params.method.toUpperCase(),
    params.url.pathname,
    canonicalQuery(params.url.searchParams),
    ts,
    nonce,
    bodyHash,
    params.apiKey,
  ].join("\n");

  const signature = createHmac("sha256", params.apiSecret).update(canonical).digest("base64");

  return {
    "X-API-Key": params.apiKey,
    "X-Timestamp": ts,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

/** GET-Anfrage an die Smoobu-API mit HMAC-Signatur (bzw. altem Header im Übergang). */
export async function smoobuGet(url: string): Promise<Response> {
  const apiKey = process.env.SMOOBU_API_KEY ?? "";
  const apiSecret = process.env.SMOOBU_API_SECRET;

  const auth: Record<string, string> = apiSecret
    ? hmacHeaders({ method: "GET", url: new URL(url), apiKey, apiSecret })
    : { "Api-Key": apiKey };

  return fetch(url, {
    method: "GET",
    headers: { ...auth, "Content-Type": "application/json" },
  });
}
