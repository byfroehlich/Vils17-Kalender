import crypto from "crypto";

// Dreame Home Cloud API (EU) – inoffiziell, nachgebaut nach dem Open-Source-Adapter
// TA2k/ioBroker.dreame (main.js: login, getHeaders, getDeviceList, sendCommand).
// Abgeglichen am 15.11.2026 nach „Dreame login failed 401“: Passwort-Hash war groß
// geschrieben, der Token lief im falschen Kopf, Geräteliste/Befehle hatten das falsche Format.
const BASE = "https://eu.iot.dreame.tech:13267";

// Feste App-Kennung (aus der Dreame-Home-App, öffentlich im Adapter)
const AUTH_BASIC = "Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg="; // dreame_appv1
const RLC_KEY = "EETjszu*XI5znHsI"; // AES-128-ECB
const RLC_PLAIN = "eu|en|DE"; // Region|Sprache|Land
const PW_SALT = "RAylYC%fmSKp7%Tq";

function computeRlc(): string {
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(RLC_KEY, "utf8"), null);
  cipher.setAutoPadding(true);
  return cipher.update(RLC_PLAIN, "utf8", "hex") + cipher.final("hex");
}
const RLC_VALUE = computeRlc();

/** MD5 über Passwort + Salz, klein geschrieben (wie die App) */
export function hashPassword(password: string): string {
  return crypto.createHash("md5").update(password + PW_SALT).digest("hex");
}

/** Kopfzeilen wie die App: authorization bleibt immer Basic, der Token steht in dreame-auth */
export function dreameHeaders(accessToken?: string): Record<string, string> {
  return {
    "user-agent": "Dart/3.2 (dart:io)",
    "dreame-meta": "cv=i_829",
    "dreame-rlc": RLC_VALUE,
    "tenant-id": "000000",
    authorization: AUTH_BASIC,
    "content-type": "application/json",
    ...(accessToken ? { "dreame-auth": `bearer ${accessToken}` } : {}),
  };
}

type Envelope<T> = { code?: number; msg?: string; success?: boolean; data?: T };

async function postJson<T>(path: string, accessToken: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: dreameHeaders(accessToken), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Dreame ${label} ${res.status}`);
  const json = (await res.json()) as Envelope<T>;
  if (json.code !== undefined && json.code !== 0) throw new Error(`Dreame ${label} code ${json.code}${json.msg ? `: ${json.msg}` : ""}`);
  return json.data as T;
}

export async function dreameLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    scope: "all",
    platform: "IOS",
    type: "account",
    username: email,
    password: hashPassword(password),
    country: "DE",
    lang: "de",
  });
  const res = await fetch(`${BASE}/dreame-auth/oauth/token`, {
    method: "POST",
    headers: { ...dreameHeaders(), "content-type": "application/x-www-form-urlencoded", "dreame-auth": "bearer" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Dreame login failed ${res.status}`);
  const data = (await res.json()) as { access_token?: string; code?: number; msg?: string };
  if (!data.access_token) throw new Error(`Dreame login ohne Token${data.code !== undefined ? ` (code ${data.code})` : ""}`);
  return data.access_token;
}

export async function dreameGetDeviceId(accessToken: string): Promise<string> {
  const overrideId = process.env.DREAME_DEVICE_ID;
  if (overrideId) return overrideId;
  const data = await postJson<{ page?: { records?: Array<{ did: string }> } }>(
    "/dreame-user-iot/iotuserbind/device/listV2",
    accessToken,
    { sharedStatus: 1, current: 1, size: 100, lang: "de", timestamp: Date.now() },
    "Geräteliste",
  );
  const did = data?.page?.records?.[0]?.did;
  if (!did) throw new Error("Kein Dreame-Gerät im Konto gefunden");
  return did;
}

async function sendCommand<T>(accessToken: string, did: string, method: string, params: unknown): Promise<T> {
  const id = Math.floor(Math.random() * 9000) + 1000;
  return postJson<T>(
    "/dreame-iot-com-10000/device/sendCommand",
    accessToken,
    { did, id, data: { did, id, method, params, from: "XXXXXX" } },
    method,
  );
}

/** Reinigung starten (MIoT-Aktion siid 2, aiid 1) */
export async function dreameStartCleaning(accessToken: string, did: string): Promise<void> {
  await sendCommand(accessToken, did, "action", { did, siid: 2, aiid: 1, in: [] });
}

export interface DreameStatus {
  /** siid 2/piid 1: 1 reinigt, 2 Standby, 3/4 pausiert, 5 fährt zurück, 6 lädt, 13 Laden fertig … */
  state: number;
  /** siid 2/piid 2: 0 = kein Fehler */
  error: number;
}

export async function dreameGetStatus(accessToken: string, did: string): Promise<DreameStatus> {
  const data = await sendCommand<{ result?: Array<{ siid: number; piid: number; value: unknown }> }>(
    accessToken,
    did,
    "get_properties",
    [
      { did, siid: 2, piid: 1 },
      { did, siid: 2, piid: 2 },
    ],
  );
  const val = (piid: number) => {
    const v = (data?.result ?? []).find((p) => p.siid === 2 && p.piid === piid)?.value;
    return typeof v === "number" ? v : -1;
  };
  return { state: val(1), error: val(2) };
}

/** Fertig, wenn der Roboter in der Station steht: Standby (2), lädt (6), Laden fertig (13) */
export function dreameIsDone(state: number): boolean {
  return [2, 6, 13].includes(state);
}
