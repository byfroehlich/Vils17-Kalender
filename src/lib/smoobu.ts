const SMOOBU_API_BASE = "https://login.smoobu.com/api";

interface SmoobuReservation {
  id: number;
  "guest-name": string;
  email: string;
  phone: string;
  adults: number;
  children: number;
  "check-in": string;
  "check-out": string;
  "arrival-time": string;
  "departure-time": string;
  "channel-name": string;
  type: string; // "reservation" | "blocked"
  apartment: { id: number; name: string };
}

interface SmoobuApartment {
  id: number;
  name: string;
}

function getHeaders() {
  return {
    "Api-Key": process.env.SMOOBU_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

export async function fetchSmoobuReservations(params: {
  from: string; // YYYY-MM-DD
  to: string;
  pageSize?: number;
  page?: number;
}): Promise<SmoobuReservation[]> {
  const url = new URL(`${SMOOBU_API_BASE}/reservations`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  url.searchParams.set("pageSize", String(params.pageSize ?? 100));
  url.searchParams.set("page", String(params.page ?? 1));

  const res = await fetch(url.toString(), { headers: getHeaders() });

  if (!res.ok) {
    throw new Error(`Smoobu API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.bookings ?? [];
}

export async function fetchSmoobuApartments(): Promise<SmoobuApartment[]> {
  const res = await fetch(`${SMOOBU_API_BASE}/apartments`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Smoobu API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.apartments ?? [];
}

export function verifySmoobuWebhook(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.SMOOBU_WEBHOOK_SECRET;
  if (!secret) return false;

  const crypto = require("crypto");
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}
