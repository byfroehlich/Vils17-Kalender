import crypto from "crypto";

// Dreame Home Cloud API (EU)
// Protocol reverse-engineered from TA2k/ioBroker.dreame open-source adapter
const BASE = "https://eu.iot.dreame.tech:13267";

// Static app credentials (extracted from Dreame Home app, public in open-source)
const AUTH_BASIC  = "Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg="; // dreame_appv1:AP^dv@z@SQYVxN88
const RLC_KEY     = "EETjszu*XI5znHsI";  // AES-128-ECB key
const RLC_PLAIN   = "eu|en|DE";          // region|lang|country
const PW_SALT     = "RAylYC%fmSKp7%Tq"; // password hashing salt

function computeRlc(): string {
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(RLC_KEY), null);
  cipher.setAutoPadding(true);
  return cipher.update(RLC_PLAIN, "utf8", "hex") + cipher.final("hex");
}

function hashPassword(password: string): string {
  return crypto.createHash("md5").update(password + PW_SALT).digest("hex").toUpperCase();
}

function baseHeaders(authHeader: string): Record<string, string> {
  return {
    "user-agent":    "Dart/3.2 (dart:io)",
    "dreame-meta":   "cv=i_829",
    "dreame-rlc":    computeRlc(),
    "tenant-id":     "000000",
    "authorization": authHeader,
  };
}

export async function dreameLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    scope:      "all",
    platform:   "IOS",
    type:       "account",
    username:   email,
    password:   hashPassword(password),
    country:    "DE",
    lang:       "de",
  });
  const res = await fetch(`${BASE}/dreame-auth/oauth/token`, {
    method: "POST",
    headers: { ...baseHeaders(AUTH_BASIC), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dreame login failed ${res.status}: ${text}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function dreameGetDeviceId(accessToken: string): Promise<string> {
  const res = await fetch(`${BASE}/dreame-user-iot/iotuserbind/device/listV2`, {
    headers: baseHeaders(`Bearer ${accessToken}`),
  });
  if (!res.ok) throw new Error(`Dreame device list failed: ${res.status}`);
  const data = await res.json() as { result?: Array<{ did: string; name?: string }> };
  const devices = data.result ?? [];
  if (devices.length === 0) throw new Error("No Dreame devices found");
  // Use DREAME_DEVICE_ID env override if set, else first device
  const overrideId = process.env.DREAME_DEVICE_ID;
  if (overrideId) {
    const found = devices.find((d) => d.did === overrideId);
    if (!found) throw new Error(`DREAME_DEVICE_ID=${overrideId} not in device list`);
    return overrideId;
  }
  return devices[0].did;
}

export async function dreameStartCleaning(accessToken: string, deviceId: string): Promise<void> {
  const res = await fetch(`${BASE}/dreame-iot-com-10000/device/sendCommand`, {
    method: "POST",
    headers: { ...baseHeaders(`Bearer ${accessToken}`), "content-type": "application/json" },
    body: JSON.stringify({
      did:      deviceId,
      commands: [{ siid: 2, aiid: 1, in: [] }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dreame sendCommand failed ${res.status}: ${text}`);
  }
}

// Returns the raw device state value (siid=2, piid=2)
// Known states: 1=sweeping, 2=idle, 4=error, 5=returning, 6=charging, 8=sleeping
export async function dreameGetStatus(accessToken: string, deviceId: string): Promise<number> {
  const res = await fetch(`${BASE}/dreame-iot-com-10000/device/getProperties`, {
    method: "POST",
    headers: { ...baseHeaders(`Bearer ${accessToken}`), "content-type": "application/json" },
    body: JSON.stringify({
      did:        deviceId,
      properties: [{ siid: 2, piid: 2 }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dreame getProperties failed ${res.status}: ${text}`);
  }
  const data = await res.json() as { result?: Array<{ siid: number; piid: number; value: unknown }> };
  const prop = (data.result ?? []).find((p) => p.siid === 2 && p.piid === 2);
  return typeof prop?.value === "number" ? prop.value : -1;
}

// Robot is considered "done" when idle (2), charging (6), or sleeping (8)
export function dreameIsDone(status: number): boolean {
  return [2, 6, 8].includes(status);
}
